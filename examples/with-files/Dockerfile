# Ship your configuration and workflow inside an image of your own.
#
# Files are copied in, never mounted from the host: the image stays
# reproducible, and nothing the container writes can land in your working
# copy. Build this next to your `config.yaml` and `workflow.yaml`.

FROM mwaeckerlin/webdesign-scanner

USER root
COPY config.yaml workflow.yaml /etc/webdesign-scanner/
RUN ${ALLOW_USER} /etc/webdesign-scanner
USER ${RUN_USER}

ENV CONFIG_FILE="/etc/webdesign-scanner/config.yaml"
ENV WORKFLOW_FILE="/etc/webdesign-scanner/workflow.yaml"
