export function cadStepMultipartPayload(input: {
  fileName: string;
  fileText: string;
  label: string;
  projectId: string;
  seasonId: string;
}) {
  const boundary = "mission-control-cad-step-test-boundary";
  const text = (value: string) => Buffer.from(value, "utf8");
  const field = (name: string, value: string) => text(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  );
  const fileHeader = (name: string, filename: string, contentType: string) => text(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const previewHeader = Buffer.alloc(20);
  previewHeader.write("glTF", 0, "ascii");

  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      field("label", input.label),
      field("projectId", input.projectId),
      field("seasonId", input.seasonId),
      fileHeader("file", input.fileName, "application/step"),
      text(input.fileText),
      text("\r\n"),
      fileHeader("optimizedModel", input.fileName.replace(/\.step$/i, ".glb"), "model/gltf-binary"),
      previewHeader,
      text(`\r\n--${boundary}--\r\n`),
    ]),
  };
}
