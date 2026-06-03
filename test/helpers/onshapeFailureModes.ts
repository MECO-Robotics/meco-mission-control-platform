import { createOnshapeApiClient } from "../../src/onshape/onshapeApiClient";
import { createOnshapeCadClient } from "../../src/onshape/onshapeCadClient";
import { setOnshapeCadClientFactoryForTests } from "../../src/onshape/onshapeClientFactory";
import type { OnshapeTransport } from "../../src/onshape/onshapeTypes";

export const versionUrl =
  "https://cad.onshape.com/documents/0123456789abcdef01234567/v/222222222222222222222222/e/111111111111111111111111";

export function setTransportClientFactory(transport: OnshapeTransport) {
  setOnshapeCadClientFactoryForTests((store) =>
    createOnshapeCadClient(
      createOnshapeApiClient({
        store,
        credentials: { mode: "oauth", bearerToken: "test-access-token" },
        transport,
      }),
    ));
}

export function simpleBomPayload() {
  return {
    rootAssembly: {
      documentId: "0123456789abcdef01234567",
      elementId: "111111111111111111111111",
      occurrenceId: "root",
      name: "Robot master",
      children: [
        {
          documentId: "0123456789abcdef01234567",
          elementId: "111111111111111111111111",
          partId: "plate",
          occurrenceId: "plate-1",
          name: "Belly pan",
          partNumber: "DRV-100",
        },
      ],
    },
  };
}
