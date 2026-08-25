/** Execution of a parsed workflow against a real browser context.
 *
 * A failing step aborts the run. That is deliberate: if the login did not
 * work, whatever is on screen is a login form or an error page, and capturing
 * it would produce a design review of the wrong page.
 */

import type { BrowserContext, Frame, FrameLocator, Locator, Page } from 'playwright'

import { workflowError } from './errors.js'
import type { Logger } from './logging.js'
import { describeMatch, globToRegExp, matches } from './match.js'
import type { SecretRegistry } from './secrets.js'
import type { Condition, FrameRef, Step, Target, Workflow } from './workflow.js'

type Scope = Page | Frame | FrameLocator | Locator

export interface StepResult {
  index: number
  action: string
  label: string
  status: 'ok' | 'skipped' | 'failed'
  durationMs: number
  reason?: string
}

export interface WorkflowRunResult {
  name: string
  version: number
  status: 'completed'
  steps: StepResult[]
  activePage: Page
}

const nameOf = (target: Target): string => {
  const parts: string[] = []
  if (target.role) parts.push(`role=${target.role}${target.name ? ` name=${JSON.stringify(target.name)}` : ''}`)
  if (target.label) parts.push(`label=${JSON.stringify(target.label)}`)
  if (target.placeholder) parts.push(`placeholder=${JSON.stringify(target.placeholder)}`)
  if (target.text) parts.push(`text=${JSON.stringify(target.text)}`)
  if (target.testId) parts.push(`testId=${JSON.stringify(target.testId)}`)
  if (target.altText) parts.push(`altText=${JSON.stringify(target.altText)}`)
  if (target.title) parts.push(`title=${JSON.stringify(target.title)}`)
  if (target.css) parts.push(`css=${JSON.stringify(target.css)}`)
  if (target.hasText) parts.push(`hasText=${JSON.stringify(target.hasText)}`)
  if (target.nth !== undefined) parts.push(`nth=${target.nth}`)
  return parts.join(' ')
}

/** Turn a declarative target into a Playwright locator. */
export const resolveTarget = (scope: Scope, target: Target): Locator => {
  const base: Scope = target.within ? resolveTarget(scope, target.within) : scope
  const exact = target.exact
  let locator: Locator
  if (target.role !== undefined) {
    locator = base.getByRole(target.role as Parameters<Page['getByRole']>[0], {
      ...(target.name === undefined ? {} : { name: target.name }),
      ...(exact === undefined ? {} : { exact })
    })
  } else if (target.label !== undefined) {
    locator = base.getByLabel(target.label, exact === undefined ? {} : { exact })
  } else if (target.placeholder !== undefined) {
    locator = base.getByPlaceholder(target.placeholder, exact === undefined ? {} : { exact })
  } else if (target.text !== undefined) {
    locator = base.getByText(target.text, exact === undefined ? {} : { exact })
  } else if (target.testId !== undefined) {
    locator = base.getByTestId(target.testId)
  } else if (target.altText !== undefined) {
    locator = base.getByAltText(target.altText, exact === undefined ? {} : { exact })
  } else if (target.title !== undefined) {
    locator = base.getByTitle(target.title, exact === undefined ? {} : { exact })
  } else {
    locator = base.locator(target.css!)
  }
  if (target.hasText !== undefined) locator = locator.filter({ hasText: target.hasText })
  if (target.nth !== undefined) locator = locator.nth(target.nth)
  return locator
}

export class WorkflowRunner {
  private readonly pages = new Map<string, Page>()
  private active = 'main'

  constructor(
    private readonly context: BrowserContext,
    mainPage: Page,
    private readonly workflow: Workflow,
    private readonly logger: Logger,
    private readonly secrets: SecretRegistry
  ) {
    this.pages.set('main', mainPage)
  }

  get activePage(): Page {
    const page = this.pages.get(this.active)
    if (!page) throw workflowError(`no active page named ${this.active}`)
    return page
  }

  private pageFor(step: Step): Page {
    if (step.page === null) return this.activePage
    const page = this.pages.get(step.page)
    if (!page) throw workflowError(`step ${step.index} (${step.label}): page ${step.page} was never opened`)
    return page
  }

  private scopeFor(page: Page, frame: FrameRef | null): Scope {
    if (frame === null) return page
    if (frame.css !== undefined) return page.frameLocator(frame.css)
    const found = frame.name !== undefined
      ? page.frame({ name: frame.name })
      : page.frame({ url: globToRegExp(frame.url!) })
    if (!found) {
      throw workflowError(`frame not found: ${frame.name !== undefined ? `name=${frame.name}` : `url=${frame.url}`}`)
    }
    return found
  }

  private timeoutFor(step: Step): number {
    return step.timeout ?? this.workflow.defaults.timeout
  }

  /** Evaluate a condition immediately, without waiting.
   *
   * A condition that cannot be evaluated counts as not met. That happens
   * when the page is navigating away while the condition is checked, and
   * treating it as an error would make every workflow that branches after a
   * click depend on timing.
   */
  private async evaluateCondition(condition: Condition, page: Page, frame: FrameRef | null): Promise<boolean> {
    try {
      switch (condition.kind) {
        case 'visible':
          return await resolveTarget(this.scopeFor(page, frame), condition.target).isVisible()
        case 'hidden':
          return !(await resolveTarget(this.scopeFor(page, frame), condition.target).isVisible())
        case 'urlMatches':
          return matches(page.url(), condition.url, condition.match)
        case 'not':
          return !(await this.evaluateCondition(condition.condition, page, frame))
      }
    } catch (error) {
      this.logger.debug(`condition could not be evaluated, counted as not met: ${this.secrets.maskError(error)}`)
      return false
    }
  }

  /** Run every step in order and return the state reached. */
  async run(): Promise<WorkflowRunResult> {
    const results: StepResult[] = []
    for (const step of this.workflow.steps) {
      results.push(await this.runStep(step))
    }
    return {
      name: this.workflow.name,
      version: this.workflow.version,
      status: 'completed',
      steps: results,
      activePage: this.activePage
    }
  }

  private async runStep(step: Step): Promise<StepResult> {
    const started = Date.now()
    const page = this.pageFor(step)

    if (step.when !== null) {
      const met = await this.evaluateCondition(step.when, page, step.frame)
      if (!met) {
        this.logger.info(`workflow step ${step.index} (${step.label}): condition not met, skipped`)
        return { index: step.index, action: step.action, label: step.label, status: 'skipped', durationMs: Date.now() - started, reason: 'condition not met' }
      }
    }

    try {
      await this.perform(step, page)
      this.logger.debug(`workflow step ${step.index} (${step.label}): ok`)
      return { index: step.index, action: step.action, label: step.label, status: 'ok', durationMs: Date.now() - started }
    } catch (error) {
      const reason = this.secrets.maskError(error)
      if (step.optional) {
        this.logger.warn(`workflow step ${step.index} (${step.label}) is optional and did not apply: ${reason}`)
        return { index: step.index, action: step.action, label: step.label, status: 'skipped', durationMs: Date.now() - started, reason }
      }
      throw workflowError(`workflow step ${step.index} (${step.label}) failed: ${reason}`, {
        step: step.index,
        action: step.action
      })
    }
  }

  private async perform(step: Step, page: Page): Promise<void> {
    const timeout = this.timeoutFor(step)
    const scope = this.scopeFor(page, step.frame)
    const locator = 'target' in step && step.target ? resolveTarget(scope, step.target as Target) : null

    switch (step.action) {
      case 'goto':
        await page.goto(step.url, { waitUntil: step.waitUntil, timeout })
        return
      case 'click':
        await locator!.click({ button: step.button, clickCount: step.clickCount, force: step.force, timeout })
        return
      case 'dblclick':
        await locator!.dblclick({ timeout })
        return
      case 'hover':
        await locator!.hover({ timeout })
        return
      case 'fill':
        await locator!.fill(step.value, { timeout })
        return
      case 'type':
        await locator!.pressSequentially(step.value, { delay: step.delay, timeout })
        return
      case 'press':
        if (locator) await locator.press(step.key, { timeout })
        else await page.keyboard.press(step.key)
        return
      case 'select':
        if (step.values) await locator!.selectOption(step.values, { timeout })
        else if (step.labels) await locator!.selectOption(step.labels.map(label => ({ label })), { timeout })
        else await locator!.selectOption(step.indexes!.map(index => ({ index })), { timeout })
        return
      case 'check':
        await locator!.check({ timeout })
        return
      case 'uncheck':
        await locator!.uncheck({ timeout })
        return
      case 'upload':
        await locator!.setInputFiles(step.files, { timeout })
        return
      case 'scrollIntoView':
        await locator!.scrollIntoViewIfNeeded({ timeout })
        return
      case 'waitForSelector':
        await locator!.waitFor({ state: step.state, timeout })
        return
      case 'waitForUrl':
        await page.waitForURL(
          step.match === 'regex' ? new RegExp(step.url) : step.match === 'glob' ? globToRegExp(step.url) : url => matches(url.toString(), step.url, step.match),
          { timeout }
        )
        return
      case 'waitForLoadState':
        await page.waitForLoadState(step.state, { timeout })
        return
      case 'waitForTimeout':
        await page.waitForTimeout(step.ms)
        return
      case 'expectVisible':
        await locator!.waitFor({ state: 'visible', timeout })
        return
      case 'expectHidden':
        await locator!.waitFor({ state: 'hidden', timeout })
        return
      case 'expectText': {
        await locator!.waitFor({ state: 'visible', timeout })
        const text = (await locator!.textContent({ timeout })) ?? ''
        if (!matches(text, step.text, step.match)) {
          throw new Error(`expected text ${describeMatch(step.text, step.match)} in ${nameOf(step.target)}, found ${JSON.stringify(text.trim())}`)
        }
        return
      }
      case 'expectCount': {
        const found = await locator!.count()
        if (found !== step.count) {
          throw new Error(`expected ${step.count} element(s) for ${nameOf(step.target)}, found ${found}`)
        }
        return
      }
      case 'expectUrl': {
        const url = page.url()
        if (!matches(url, step.url, step.match)) {
          throw new Error(`expected url ${describeMatch(step.url, step.match)}, current url is ${url}`)
        }
        return
      }
      case 'expectTitle': {
        const title = await page.title()
        if (!matches(title, step.text, step.match)) {
          throw new Error(`expected title ${describeMatch(step.text, step.match)}, current title is ${JSON.stringify(title)}`)
        }
        return
      }
      case 'expectPopup': {
        const [opened] = await Promise.all([
          this.context.waitForEvent('page', { timeout }),
          this.perform(step.trigger, page)
        ])
        await opened.waitForLoadState('domcontentloaded', { timeout })
        this.pages.set(step.name, opened)
        this.active = step.name
        return
      }
      case 'usePage': {
        const target = this.pages.get(step.name)
        if (!target) throw new Error(`page ${step.name} was never opened`)
        await target.bringToFront()
        this.active = step.name
        return
      }
      case 'closePage': {
        const target = this.pages.get(step.name)
        if (!target) throw new Error(`page ${step.name} was never opened`)
        if (step.name === 'main') throw new Error('the main page cannot be closed')
        await target.close()
        this.pages.delete(step.name)
        if (this.active === step.name) this.active = 'main'
        return
      }
      case 'saveStorageState':
        await this.context.storageState({ path: step.path })
        this.logger.info(`stored authenticated browser state in ${step.path}`)
        return
      case 'ready':
        this.logger.info('workflow released the state for capture')
        return
    }
  }
}
