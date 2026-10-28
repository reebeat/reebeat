// The tests' one runtime adapter: the platform services (file system, path, crypto) the adapter runs on.
import { NodeServices } from "@effect/platform-node";

export const platform = NodeServices.layer;
