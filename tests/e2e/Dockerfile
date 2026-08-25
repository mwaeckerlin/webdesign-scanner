# The scanner with the test configurations and workflows baked in.
#
# The fixture password is placed where a docker secret would appear, so the
# workflow reads it exactly the way a real one does. It is a fixture value,
# not a credential.

FROM mwaeckerlin/webdesign-scanner

USER root
COPY fixtures/ /etc/wds/
RUN mkdir -p /run/secrets
RUN cp /etc/wds/test-password.txt /run/secrets/scan_password
RUN ${ALLOW_USER} /etc/wds /run/secrets
USER ${RUN_USER}
