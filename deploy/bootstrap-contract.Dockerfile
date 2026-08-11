FROM busybox:1.37.0-uclibc@sha256:8d7b1636e974e0adfd8d945955fca609304f0a56c18799dfd032d6e661382d84

COPY contract.json manifest.json /contract/

CMD ["/bin/true"]
