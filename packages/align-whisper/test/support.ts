// The tests' one runtime adapter: the platform services (file system, path, child processes) and the SHA-256 digest.
import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { Layer } from "effect";

export const platform = Layer.merge(NodeServices.layer, NodeCrypto.layerDigest);
