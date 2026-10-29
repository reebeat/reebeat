// The one runtime adapter of this directory: the platform services (file system, path, child processes) and the
// SHA-256 digest, which Effect 4.1 no longer bundles into `NodeServices`.
import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { Layer } from "effect";

export const platform = Layer.merge(NodeServices.layer, NodeCrypto.layerDigest);
