import { createActor } from "xstate";
import { createMachineFromSCXML } from "@xstate/scxml";
import { readFileSync } from "node:fs";
const src = readFileSync(process.argv[2], "utf8");
const machine = createMachineFromSCXML(src);
const cfg = machine.config ?? {};
console.log("machine id:", machine.id, "top-level state keys:", Object.keys(machine.states ?? cfg.states ?? {}).join(","));
const json = JSON.stringify(machine.config ?? machine.toJSON?.() ?? {}, (k, v) => (typeof v === "function" ? "[fn]" : v));
console.log("config JSON bytes", json.length, "mentions reebeat:", /reebeat|rb:|heading/.test(json));
const actor = createActor(machine).start();
console.log("start:", JSON.stringify(actor.getSnapshot().value));
for (let i = 0; i < 7; i++) { actor.send({ type: "rb.next" }); console.log("rb.next ->", JSON.stringify(actor.getSnapshot().value)); }
