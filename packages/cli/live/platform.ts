// The one runtime adapter of this directory: the platform services (file system, path, child processes, crypto).
import { NodeServices } from "@effect/platform-node";

export const platform = NodeServices.layer;
