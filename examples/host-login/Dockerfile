# Bake the login workflow into an image of its own — no host mount, so the
# image stays reproducible and nothing the container writes lands in your tree.

FROM mwaeckerlin/webdesign-scanner

USER root
COPY workflow.yaml /etc/webdesign-scanner/
RUN ${ALLOW_USER} /etc/webdesign-scanner
USER ${RUN_USER}

ENV WORKFLOW_FILE="/etc/webdesign-scanner/workflow.yaml"
