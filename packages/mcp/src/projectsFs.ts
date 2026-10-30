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

/** A file name `tsukuri build` writes (the rule of `requireOutputName`): the only names a manifest may give a linked file. */
const safeName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

/** At most this many entries in a build directory: a build has a few dozen, and the walk is bounded. */
const maxBuildEntries = 20_000;

/** What a file is called in a message: a fixed phrase, never a name taken from a file. */
type Role = string;

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
        ({ path: name }) =>
          safeName.test(name) && !Str.includes("..")(name) && matches(name)
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

/** Why a listing of the build directory is refused (a link, an odd entry, too many entries), or none. */
const refusalOf = (
  entries: readonly { readonly type: FileSystem.File.Type }[],
  seen: number
): Option.Option<string> => {
  if (seen > maxBuildEntries) {
    return Option.some("the build directory holds too many entries");
  }

  return Option.map(
    Arr.findFirst(
      entries,
      ({ type }) => type !== "File" && type !== "Directory"
    ),
    ({ type }) =>
      type === "SymbolicLink"
        ? "the build directory holds a symbolic link: refused"
        : "the build directory holds an entry that is neither a file nor a directory"
  );
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
      const lstatOrNone = (file: string, project: string, role: Role) =>
        fs.lstat(file).pipe(
          Effect.asSome,
          Effect.catchIf(isNotFound, () => Effect.succeedNone),
          Effect.tapError((cause) =>
            Effect.logWarning(`lstat ${file} failed`, cause)
          ),
          Effect.mapError(() => unreadable(project, `cannot look at ${role}`))
        );

      /** A regular file's bytes, or none when absent; a symbolic link, another kind or a large file is refused. */
      const readRegular = Effect.fnUntraced(function* readRegular(
        file: string,
        project: string,
        role: Role
      ) {
        const info = yield* lstatOrNone(file, project, role);

        if (Option.isNone(info)) {
          return Option.none<Uint8Array>();
        }

        if (info.value.type === "SymbolicLink") {
          return yield* refuse(project, `${role} is a symbolic link: refused`);
        }

        if (info.value.type !== "File") {
          return yield* refuse(project, `${role} is not a regular file`);
        }

        if (Number(info.value.size) > maxBytes) {
          return yield* refuse(
            project,
            `${role} is larger than ${maxBytes} bytes`
          );
        }

        const bytes = yield* fs.readFile(file).pipe(
          Effect.tapError((cause) =>
            Effect.logWarning(`reading ${file} failed`, cause)
          ),
          Effect.mapError(() => unreadable(project, `cannot read ${role}`))
        );

        return Option.some(bytes);
      });

      /** A real directory: none when absent or not a directory, refused when it is a symbolic link. */
      const requireDirectory = Effect.fnUntraced(function* requireDirectory(
        dir: string,
        project: string,
        role: Role
      ) {
        const info = yield* lstatOrNone(dir, project, role);

        if (Option.isSome(info) && info.value.type === "SymbolicLink") {
          return yield* refuse(project, `${role} is a symbolic link: refused`);
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
          project,
          "the project directory"
        );

        if (Option.isNone(dir)) {
          return yield* new ProjectNotFound({
            message: `no project ${project} in the workspace`,
            project,
          });
        }

        const story = yield* readRegular(
          path.join(rootDir, project, screenplayName),
          project,
          "the Screenplay"
        );

        if (Option.isNone(story)) {
          return yield* new ProjectNotFound({
            message: `${project} has no ${screenplayName}: it is not a project`,
            project,
          });
        }

        const config = yield* readRegular(
          path.join(rootDir, project, configName),
          project,
          "the project config"
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

      /** The file a manifest names for `role` must be a regular file: ffmpeg and a browser would follow a link. */
      const requireFile = (file: string, project: string, role: Role) =>
        Effect.flatMap(lstatOrNone(file, project, role), (found) =>
          Option.isSome(found) && found.value.type === "File"
            ? Effect.void
            : refuse(project, `${role} is not a regular file`)
        );

      /**
       * Walks the whole build directory (spec 0018, Revision 14): no entry may be a symbolic link or anything but a file or
       * a directory, at any depth, and there are at most `maxBuildEntries` of them. A link inside the build is the way to
       * reach a file outside the root through a name that looks inside it, so the tree is refused as a whole.
       */
      const requireTreeWithoutLinks = (
        dir: string,
        project: string
      ): Effect.Effect<void, Unreadable> => {
        const seen = { entries: 0 };

        const visit = (here: string): Effect.Effect<void, Unreadable> =>
          Effect.gen(function* visitDirectory() {
            const entries = yield* fs.readDirectoryEntries(here).pipe(
              Effect.tapError((cause) =>
                Effect.logWarning(`listing ${here} failed`, cause)
              ),
              Effect.mapError(() =>
                unreadable(project, "cannot list the build directory")
              )
            );

            seen.entries += entries.length;

            const refusal = refusalOf(entries, seen.entries);

            return yield* Option.match(refusal, {
              onNone: () =>
                Effect.forEach(
                  Arr.filter(entries, ({ type }) => type === "Directory"),
                  ({ name }) => visit(path.join(here, name)),
                  { discard: true }
                ),
              onSome: (reason) => refuse(project, reason),
            });
          });

        return visit(dir);
      };

      const readBuild = Effect.fnUntraced(function* readBuild(
        project: ProjectId,
        head: ProjectHead
      ) {
        const base = path.join(buildsDir, project);

        const dir = yield* requireDirectory(
          base,
          project,
          "the build directory"
        );

        if (Option.isNone(dir)) {
          return Option.none<BuildRecord>();
        }

        const manifest = yield* readRegular(
          path.join(base, manifestName),
          project,
          "the build manifest"
        );

        if (Option.isSome(manifest)) {
          yield* requireTreeWithoutLinks(base, project);
        }

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

        yield* requireFile(files.value.deck, project, "the deck");
        yield* requireFile(files.value.mp4, project, "the video");
        yield* requireFile(files.value.plan, project, "the plan");
        yield* requireFile(files.value.vtt, project, "the subtitles");

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

        const role = which === "plan" ? "the plan" : "the subtitles";

        return Effect.flatMap(readRegular(file, project, role), (bytes) =>
          Option.match(bytes, {
            onNone: () => refuse(project, `${role} is missing`),
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
