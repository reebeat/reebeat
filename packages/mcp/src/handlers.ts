// The handlers of the read-only tools that answer from the Screenplay and the files of a build (spec 0016, Revisions
// "first slice" and "review round 1"); `artifact_observe` is in `observe.ts`. Each is a total reading of what the
// services return: it takes the decoded input of its declaration, asks `Projects` and `Docs`, and returns the
// structured result with a one-line summary and any extra content (links). A handler holds no path and no authority:
// nothing here can name a publisher, an approval or a write.
import { encodePlan, reviewText } from "@tsukuri/core";
import {
  BuildNotFound,
  Invalid,
  Projects,
  StoryInvalid,
  buildGet,
  docsGet,
  planGet,
  projectGet,
  projectList,
  storyLint,
  storyRead,
  untrusted,
} from "@tsukuri/lifecycle";
import type { BuildRecord, ProjectHead } from "@tsukuri/lifecycle";
import { Array as Arr, Effect, Option, Result, String as Str } from "effect";

import { allowedFor, analyse, headStage } from "./analysis.ts";
import type { Analysis } from "./analysis.ts";
import { bind } from "./bind.ts";
import type { Registered } from "./bind.ts";
import { Docs } from "./docs.ts";
import { observe } from "./observe.ts";
import { present } from "./optional.ts";
import { clip, linesOf, pageItems, pageText } from "./pages.ts";
import type { TextPage } from "./pages.ts";
import {
  buildOf,
  count,
  headStory,
  requireBuild,
  timedPlanOf,
} from "./readers.ts";

const briefOf = (head: ProjectHead) =>
  Effect.gen(function* brief() {
    const projects = yield* Projects;
    const { text } = yield* projects.story(head.project);

    const build = Option.getOrUndefined(
      yield* projects
        .build(head.project)
        .pipe(Effect.catchTag("Unreadable", () => Effect.succeedNone))
    );

    return {
      bytes: head.bytes,
      hasBuild: build !== undefined,
      hasConfig: head.hasConfig,
      project: head.project,
      revision: head.revision,
      stage: headStage(analyse(text, head.screenplaySha256), build),
    };
  });

const projectListHandler = bind(projectList, (input) =>
  Effect.gen(function* run() {
    const projects = yield* Projects;
    const heads = yield* projects.list;

    const page = pageItems(heads, input);

    const briefs = yield* Effect.forEach(page.items, briefOf, {
      concurrency: 4,
    }).pipe(Effect.catchTag("ProjectNotFound", () => Effect.succeed([])));

    return {
      summary: `${count(heads.length, "project")}, showing ${briefs.length}`,
      value: { projects: briefs, ...present("nextCursor", page.nextCursor) },
    };
  })
);

/** One phrase on the build of a project, for a summary line. */
const buildNote = (build: BuildRecord | undefined): string => {
  if (build === undefined) {
    return "no build";
  }

  return build.matchesHead.screenplay
    ? "build of the head"
    : "build of another Screenplay";
};

const projectGetHandler = bind(projectGet, (input) =>
  Effect.gen(function* run() {
    const projects = yield* Projects;
    const { head, text } = yield* projects.story(input.project);
    const build = yield* buildOf(input.project);
    const stage = headStage(analyse(text, head.screenplaySha256), build);

    return {
      summary: `${head.project}: ${stage}, ${buildNote(build)}`,
      value: {
        allowed: allowedFor(build),
        ...present(
          "build",
          build === undefined
            ? undefined
            : { build: build.id, matchesHead: build.matchesHead }
        ),
        bytes: head.bytes,
        hasConfig: head.hasConfig,
        lines: linesOf(text).length,
        project: head.project,
        revision: head.revision,
        stage,
      },
    };
  })
);

/** A page of text with the project and revision it belongs to; the text is the project's, so it is typed untrusted. */
const pagedText = (head: ProjectHead, page: TextPage) => ({
  ...page,
  project: head.project,
  revision: head.revision,
  text: untrusted(page.text),
});

const describe = (page: TextPage): string =>
  `lines ${page.fromLine} to ${page.toLine} of ${page.totalLines}`;

const docsGetHandler = bind(docsGet, (input) =>
  Effect.gen(function* run() {
    const docs = yield* Docs;
    const text = yield* docs.read(input.topic);
    const page = pageText(text, input.fromLine ?? 1);

    return {
      summary: `${input.topic}: ${describe(page)}`,
      value: { ...page, topic: input.topic },
    };
  })
);

const requireRange = (
  fromLine: number | undefined,
  toLine: number | undefined
): Effect.Effect<void, Invalid> =>
  fromLine !== undefined && toLine !== undefined && toLine < fromLine
    ? Effect.fail(
        new Invalid({
          message: `toLine ${toLine} is before fromLine ${fromLine}`,
        })
      )
    : Effect.void;

const storyReadHandler = bind(storyRead, (input) =>
  Effect.gen(function* run() {
    const { head, text } = yield* headStory(input.project, input.revision);

    yield* requireRange(input.fromLine, input.toLine);

    const page = pageText(text, input.fromLine ?? 1, input.toLine);

    return {
      summary: `${head.project}: ${describe(page)}`,
      value: pagedText(head, page),
    };
  })
);

const storyLintHandler = bind(storyLint, (input) =>
  Effect.gen(function* run() {
    const { head, text } = yield* headStory(input.project, input.revision);
    const analysis = analyse(text, head.screenplaySha256);

    const page = pageItems(analysis.findings, input);

    return {
      summary: `${head.project}: ${count(analysis.errors, "error")}, ${count(analysis.listed, "absolute time")} listed`,
      value: {
        diagnostics: Arr.map(page.items, (finding) => ({
          ...present("line", finding.line),
          message: untrusted(finding.message),
          rule: finding.rule,
          ...present(
            "sceneId",
            finding.sceneId === undefined
              ? undefined
              : untrusted(finding.sceneId)
          ),
          severity: finding.severity,
        })),
        errors: analysis.errors,
        listed: analysis.listed,
        ...present("nextCursor", page.nextCursor),
        project: head.project,
        revision: head.revision,
        timing: "not-checked" as const,
      },
    };
  })
);

/** The review text with timing: the Plan of the build of the head, scheduled. */
const timingBody = (head: ProjectHead) =>
  Effect.gen(function* timing() {
    const build = yield* requireBuild(head.project);

    if (!build.matchesHead.screenplay) {
      return yield* new BuildNotFound({
        message: `${head.project} has no build of its head Screenplay: build it with tsukuri build, then ask again`,
        project: head.project,
      });
    }

    return reviewText(yield* timedPlanOf(head.project, build), {
      timing: true,
    });
  });

/** The review text or the JSON of the Plan of the Screenplay as it is now. */
const untimedBody = (
  head: ProjectHead,
  analysis: Analysis,
  view: "json" | "review"
) =>
  Effect.gen(function* untimed() {
    if (analysis.plan === undefined) {
      const [first] = analysis.findings;

      // The importer's message quotes the Screenplay, which is untrusted text: an error carries none, story_lint does.
      const where = first?.line === undefined ? "" : ` (line ${first.line})`;

      return yield* new StoryInvalid({
        ...present("line", first?.line),
        message: `${head.project}: the Screenplay does not import${where}; story_lint says why`,
        project: head.project,
      });
    }

    return view === "json"
      ? yield* Effect.orDie(encodePlan(analysis.plan))
      : reviewText(analysis.plan);
  });

const planGetHandler = bind(planGet, (input) =>
  Effect.gen(function* run() {
    const { head, text } = yield* headStory(input.project, input.revision);

    const body =
      input.view === "timing"
        ? yield* timingBody(head)
        : yield* untimedBody(
            head,
            analyse(text, head.screenplaySha256),
            input.view
          );

    const page = pageText(body, input.fromLine ?? 1);

    return {
      summary: `${head.project}: ${input.view} plan, ${describe(page)}`,
      value: { ...pagedText(head, page), view: input.view },
    };
  })
);

/** A `file://` link with every path segment percent-encoded, so a `#`, a `?` or a space cannot end the path. */
const fileUri = (absolute: string): string =>
  `file://${Arr.join(Arr.map(Str.split("/")(absolute), encodeURIComponent), "/")}`;

const artifactsOf = (record: BuildRecord) => {
  const rows = [
    ["deck", record.files.deck, "text/html"],
    ["video", record.files.mp4, "video/mp4"],
    ["subtitles", record.files.vtt, "text/vtt"],
    ["plan", record.files.plan, "application/json"],
  ] as const;

  return Arr.filterMap(rows, ([name, absolute, mimeType]) =>
    Option.match(
      Arr.findFirst(
        record.summary.files,
        (file) => file.path === Str.slice(record.files.dir.length + 1)(absolute)
      ),
      {
        onNone: () => Result.failVoid,
        onSome: (file) =>
          Result.succeed({
            bytes: file.bytes,
            mimeType,
            name,
            sha256: file.sha256,
            uri: fileUri(absolute),
          }),
      }
    )
  );
};

const buildGetHandler = bind(buildGet, (input) =>
  Effect.gen(function* run() {
    const record = yield* requireBuild(input.project, input.build);

    const page = pageItems(record.summary.files, input);

    const artifacts = artifactsOf(record);

    const where = record.matchesHead.screenplay
      ? "of the head Screenplay"
      : "of another Screenplay";

    return {
      links: Arr.map(artifacts, ({ bytes, mimeType, name, uri }) => ({
        bytes,
        mimeType,
        name,
        uri,
      })),
      summary: `${input.project}: build ${Str.slice(0, 12)(record.id)}, ${count(record.summary.files.length, "file")}, ${where}`,
      value: {
        adapters: Arr.map(record.summary.adapters, (adapter) => ({
          egress: {
            kind: adapter.egress.kind,
            sends: Arr.map(adapter.egress.sends, untrusted),
          },
          id: adapter.id,
          service: adapter.service,
        })),
        artifacts,
        build: record.id,
        files: Arr.map(page.items, (file) => ({
          bytes: file.bytes,
          path: untrusted(clip(file.path, 300)),
          sha256: file.sha256,
        })),
        matchesHead: record.matchesHead,
        ...present("nextCursor", page.nextCursor),
        project: input.project,
        sourceSha256: record.summary.sourceSha256,
        totalFiles: record.summary.files.length,
      },
    };
  })
);

/** Every handler, in the order of `tools`. */
export const handlers: readonly Registered[] = [
  projectListHandler,
  projectGetHandler,
  docsGetHandler,
  storyReadHandler,
  storyLintHandler,
  planGetHandler,
  buildGetHandler,
  observe,
];
