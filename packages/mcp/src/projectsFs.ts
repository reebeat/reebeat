// The file-system `Projects` (spec 0016, "first slice" and "review round 1"): a workspace root whose children are
// projects, and a builds directory whose children are builds. It is the one place a path is built, and it builds one
// only from a validated project id under a root it resolved once: no tool input is a path, a symbolic link is refused
// (never followed), and a file is read only when it is a regular file under the size cap. A failure that carries a path
// or a stack is logged for the operator and fails with a fixed message: the agent sees only what an `Unreadable` says.
import {
  BuildIdSchema,
  BuildNotFound,
  BuildSummarySchema,
  ProjectIdSchema,
  ProjectNotFound,
  Projects,
  RevisionIdSchema,
  Unreadable,
  revisionText,
} from "@tsukuri/lifecycle";
import type {
  BuildFiles,
  BuildId,
  BuildRecord,
  BuildSummary,
  BuildTextName,
  ProjectHead,
  ProjectId,
} from "@tsukuri/lifecycle";
import { sha256Hex } from "@tsukuri/pipeline";
import type { PlatformError } from "effect";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
  Predicate,
  Schema,
  String as Str,
} from "effect";
import type { Digest } from "effect/crypto";

export interface Workspace {
  /** The directory whose children are builds, named by project id. May not exist. */
  readonly builds: string;
  /** The directory whose children are projects. May not exist. */
  readonly root: string;
}

/** The largest file this layer reads: a Screenplay, a manifest or a plan is far below it. */
const maxBytes = 8 * 1024 * 1024;

const screenplayName = "story.fountain";
const configName = "tsukuri.config.json";
const manifestName = "build.json";

const decodeId = Schema.decodeUnknownResult(ProjectIdSchema);

const decodeSummary = Schema.decodeUnknownEffect(
  Schema.fromJsonString(BuildSummarySchema)
);

const isNotFound = (failure: PlatformError.PlatformError): boolean =>
  Predicate.isTagged(failure.reason, "NotFound");

const unreadable = (project: string, what: string) =>
  new Unreadable({ message: `${project}: ${what}`, project });

const refuse = (project: string, what: string) =>
  Effect.fail(unreadable(project, what));

/** The video, subtitle, plan and deck files a manifest lists at the top of its directory, or none if one is missing. */
const locateFiles = (
  summary: BuildSummary,
  base: string,
  join: (...segments: readonly string[]) => string
): Option.Option<BuildFiles> => {
  const listed = (matches: (name: string) => boolean) =>
    Option.map(
      Arr.findFirst(
        summary.files,
        ({ path: name }) => !Str.includes("/")(name) && matches(name)
      ),
      ({ path: name }) => join(base, name)
    );

  return Option.all({
    deck: listed((name) => name === "deck.html"),
    dir: Option.some(base),
    mp4: listed(Str.endsWith(".mp4")),
    plan: listed((name) => name === "plan.json"),
    vtt: listed(Str.endsWith(".vtt")),
  });
};

export const fileProjects = (
  workspace: Workspace
): Layer.Layer<
  Projects,
  never,
  Digest.Digest | FileSystem.FileSystem | Path.Path
> =>
  Layer.effect(
    Projects,
    Effect.gen(function* projectsLayer() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const digest = yield* Effect.context<Digest.Digest>();
      const decoder = new TextDecoder();

      const sha = (bytes: Uint8Array) =>
        Effect.provideContext(sha256Hex(bytes), digest);

      /** What the file system says about `file`, or none when it is absent; a failure is logged and refused. */
      const lstatOrNone = (file: string, project: string) =>
        fs.lstat(file).pipe(
          Effect.asSome,
          Effect.catchIf(isNotFound, () => Effect.succeedNone),
          Effect.tapError((cause) =>
            Effect.logWarning(`lstat ${file} failed`, cause)
          ),
          Effect.mapError(() =>
            unreadable(project, `cannot look at ${path.basename(file)}`)
          )
        );

      /** A regular file's bytes, or none when absent; a symbolic link, another kind or a large file is refused. */
      const readRegular = Effect.fnUntraced(function* readRegular(
        file: string,
        project: string
      ) {
        const info = yield* lstatOrNone(file, project);

        if (Option.isNone(info)) {
          return Option.none<Uint8Array>();
        }

        const name = path.basename(file);

        if (info.value.type === "SymbolicLink") {
          return yield* refuse(project, `${name} is a symbolic link: refused`);
        }

        if (info.value.type !== "File") {
          return yield* refuse(project, `${name} is not a regular file`);
        }

        if (Number(info.value.size) > maxBytes) {
          return yield* refuse(
            project,
            `${name} is larger than ${maxBytes} bytes`
          );
        }

        const bytes = yield* fs.readFile(file).pipe(
          Effect.tapError((cause) =>
            Effect.logWarning(`reading ${file} failed`, cause)
          ),
          Effect.mapError(() => unreadable(project, `cannot read ${name}`))
        );

        return Option.some(bytes);
      });

      /** A real directory: none when absent or not a directory, refused when it is a symbolic link. */
      const requireDirectory = Effect.fnUntraced(function* requireDirectory(
        dir: string,
        project: string
      ) {
        const info = yield* lstatOrNone(dir, project);

        if (Option.isSome(info) && info.value.type === "SymbolicLink") {
          return yield* refuse(
            project,
            `${path.basename(dir)} is a symbolic link: refused`
          );
        }

        return Option.filter(info, ({ type }) => type === "Directory");
      });

      const rootDir = yield* fs
        .realPath(workspace.root)
        .pipe(Effect.orElseSucceed(() => path.resolve(workspace.root)));

      const buildsDir = yield* fs
        .realPath(workspace.builds)
        .pipe(Effect.orElseSucceed(() => path.resolve(workspace.builds)));

      const readHead = Effect.fnUntraced(function* readHead(
        project: ProjectId
      ) {
        const dir = yield* requireDirectory(
          path.join(rootDir, project),
          project
        );

        if (Option.isNone(dir)) {
          return yield* new ProjectNotFound({
            message: `no project ${project} in the workspace`,
            project,
          });
        }

        const story = yield* readRegular(
          path.join(rootDir, project, screenplayName),
          project
        );

        if (Option.isNone(story)) {
          return yield* new ProjectNotFound({
            message: `${project} has no ${screenplayName}: it is not a project`,
            project,
          });
        }

        const config = yield* readRegular(
          path.join(rootDir, project, configName),
          project
        );

        const screenplaySha256 = yield* sha(story.value);

        const configSha256 = Option.isSome(config)
          ? yield* sha(config.value)
          : undefined;

        const head: ProjectHead = {
          bytes: story.value.byteLength,
          hasConfig: Option.isSome(config),
          project,
          revision: RevisionIdSchema.make(
            yield* sha(
              new TextEncoder().encode(
                revisionText(screenplaySha256, configSha256)
              )
            )
          ),
          screenplaySha256,
        };

        return { head, text: decoder.decode(story.value) };
      });

      /** The video must be a regular file too: ffmpeg would follow a link. */
      const requireVideo = (file: string, project: string) =>
        Effect.flatMap(lstatOrNone(file, project), (video) =>
          Option.isSome(video) && video.value.type === "File"
            ? Effect.void
            : refuse(project, `${path.basename(file)} is not a regular file`)
        );

      const readBuild = Effect.fnUntraced(function* readBuild(
        project: ProjectId,
        head: ProjectHead
      ) {
        const base = path.join(buildsDir, project);
        const dir = yield* requireDirectory(base, project);

        if (Option.isNone(dir)) {
          return Option.none<BuildRecord>();
        }

        const manifest = yield* readRegular(
          path.join(base, manifestName),
          project
        );

        if (Option.isNone(manifest)) {
          return Option.none<BuildRecord>();
        }

        const summary = yield* decodeSummary(
          decoder.decode(manifest.value)
        ).pipe(
          Effect.tapError((cause) =>
            Effect.logWarning(
              `${project}: ${manifestName} does not decode`,
              cause
            )
          ),
          Effect.mapError(() =>
            unreadable(project, `${manifestName} is not a build manifest`)
          )
        );

        const files = locateFiles(summary, base, path.join);

        if (Option.isNone(files)) {
          return yield* refuse(
            project,
            `${manifestName} does not list the deck, the video, the subtitles and the plan`
          );
        }

        yield* requireVideo(files.value.mp4, project);

        const record: BuildRecord = {
          files: files.value,
          id: BuildIdSchema.make(yield* sha(manifest.value)),
          matchesHead: {
            config: head.hasConfig ? "unknown" : "absent",
            screenplay: summary.sourceSha256 === head.screenplaySha256,
          },
          summary,
        };

        return Option.some(record);
      });

      const list = Effect.gen(function* listAll() {
        const names = yield* fs.readDirectory(rootDir).pipe(
          Effect.catchIf(isNotFound, () =>
            Effect.succeed<readonly string[]>([])
          ),
          Effect.tapError((cause) =>
            Effect.logWarning(`listing ${rootDir} failed`, cause)
          ),
          Effect.mapError(() =>
            unreadable("workspace", "cannot list the workspace")
          )
        );

        const ids = Arr.sort(
          Arr.filterMap(names, (name) => decodeId(name)),
          Order.String
        );

        // An entry that is not a readable project (a link, a directory with no Screenplay) is not listed.
        const heads = yield* Effect.forEach(ids, (id) =>
          Effect.option(Effect.map(readHead(id), ({ head }) => head))
        );

        return Arr.getSomes(heads);
      });

      const textOf = (
        project: ProjectId,
        record: BuildRecord,
        which: BuildTextName
      ) => {
        const file = which === "plan" ? record.files.plan : record.files.vtt;

        return Effect.flatMap(readRegular(file, project), (bytes) =>
          Option.match(bytes, {
            onNone: () => refuse(project, `${path.basename(file)} is missing`),
            onSome: (value) => Effect.succeed(decoder.decode(value)),
          })
        );
      };

      return Projects.of({
        build: (project) =>
          Effect.flatMap(readHead(project), ({ head }) =>
            readBuild(project, head)
          ),
        buildText: (project, wanted: BuildId, which: BuildTextName) =>
          Effect.gen(function* buildText() {
            const { head } = yield* readHead(project);
            const record = yield* readBuild(project, head);

            if (Option.isNone(record) || record.value.id !== wanted) {
              return yield* new BuildNotFound({
                message: `project ${project} has no build ${wanted}`,
                project,
              });
            }

            return yield* textOf(project, record.value, which);
          }),
        head: (project) => Effect.map(readHead(project), ({ head }) => head),
        list,
        story: (project) => readHead(project),
      });
    })
  );
