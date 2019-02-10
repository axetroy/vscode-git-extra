import * as vscode from "vscode";
const simpleGit = require("simple-git");
import * as execa from "execa";
import { Inject, Service } from "typedi";
import { Localize } from "./Localize";

interface IGitStatusOutput {
  file: string;
  mode: string | void;
}

interface IMessageMeta {
  type: string;
  scope?: string;
  subject: string;
  body?: string;
  footer?: string;
}

@Service()
export default class Git {
  @Inject() public i18n!: Localize;
  public async hasUncommitFiles(cwd: string): Promise<boolean> {
    const result = await execa("git", ["diff", "--name-only"], { cwd });
    return Boolean(result.stdout);
  }
  private generateCommitMessage(meta: IMessageMeta): string {
    const { type, scope, subject: _subject, body, footer } = meta;
    const firstChartSubject = _subject[0].toLowerCase();
    const arr = _subject.split("");
    arr[0] = firstChartSubject;
    const subject = arr.join("");
    let message = `${type}${scope ? "(" + scope.trim() + ")" : ""}: ${subject}`;

    if (body) {
      message += "\n" + body;
    }

    if (footer) {
      message += "\n" + footer;
    }

    return message.trim();
  }
  private parseOutput(output: string): IGitStatusOutput[] {
    output = output.trim();
    const filesCol = output.split("\n");
    const result: IGitStatusOutput[] = [];
    for (const col of filesCol) {
      const arr = col.split(/\s/);
      const modeRaw = arr[0];
      const mode = modeRaw.indexOf("?") >= 0 ? undefined : modeRaw; // change mode
      const file = arr[1];
      result.push({
        file,
        mode
      });
    }
    return result;
  }
  private async getGitStatus(cwd: string): Promise<IGitStatusOutput[]> {
    const ps = await execa(
      "git",
      ["status", "--untracked-files=all", "--porcelain"],
      { cwd }
    );
    return this.parseOutput(ps.stdout);
  }
  private async getStageFiles(cwd: string): Promise<string[]> {
    return (await this.getGitStatus(cwd))
      .filter(v => !!v.mode)
      .map(v => v.file);
  }
  private async getUnStageFiles(cwd: string): Promise<string[]> {
    return (await this.getGitStatus(cwd)).filter(v => !v.mode).map(v => v.file);
  }
  public async commit(): Promise<void> {
    const cwd = vscode.workspace.rootPath;

    if (!cwd) {
      return;
    }

    const hasUncommitFiles = await this.hasUncommitFiles(cwd);

    if (!hasUncommitFiles) {
      vscode.window.showInformationMessage(
        this.i18n.localize("tip.message.nofile")
      );
      return;
    }

    const unstageFiles = await this.getUnStageFiles(cwd);

    const type = await vscode.window.showQuickPick(
      [
        {
          label: "feat",
          description: this.i18n.localize("selection.feat.desc"),
          value: "feat"
        },
        {
          label: "fix",
          description: this.i18n.localize("selection.fix.desc"),
          value: "fix"
        },
        {
          label: "docs",
          description: this.i18n.localize("selection.docs.desc"),
          value: "docs"
        },
        {
          label: "style",
          description: this.i18n.localize("selection.style.desc"),
          value: "style"
        },
        {
          label: "refactor",
          description: this.i18n.localize("selection.refactor.desc"),
          value: "refactor"
        },
        {
          label: "test",
          description: this.i18n.localize("selection.test.desc"),
          value: "test"
        },
        {
          label: "chroe",
          description: this.i18n.localize("selection.chroe.desc"),
          value: "chore"
        }
      ],
      {
        placeHolder: unstageFiles.length
          ? this.i18n.localize("common.stage", unstageFiles.length)
          : this.i18n.localize("placeholder.type")
      }
    );

    if (!type) {
      return;
    }

    const isSimpleMode = vscode.workspace
      .getConfiguration("git-extra")
      .get("simple") as boolean;

    let scope = "";
    if (!isSimpleMode) {
      const result = await vscode.window.showInputBox({
        placeHolder: this.i18n.localize("placeholder.scope"),
        prompt: this.generateCommitMessage({
          type: type.value,
          scope: "[scope]",
          subject: "<subject>",
          body: "",
          footer: ""
        })
      });
      if (result) {
        scope = result;
      } else if (result === undefined) {
        // cancel
        return;
      }
    }

    const subject = await vscode.window.showInputBox({
      placeHolder: this.i18n.localize("placeholder.subject"),
      prompt: this.generateCommitMessage({
        type: type.value,
        scope,
        subject: "<subject>",
        body: "",
        footer: ""
      })
    });

    if (!subject) {
      return;
    }

    let body = "";

    if (!isSimpleMode) {
      const result = await vscode.window.showInputBox({
        placeHolder: this.i18n.localize("placeholder.body"),
        prompt: this.generateCommitMessage({
          type: type.value,
          scope,
          subject,
          body: "[body]",
          footer: ""
        })
      });
      if (result) {
        body = result;
      } else if (result === undefined) {
        // cancel
        return;
      }
    }

    const message = this.generateCommitMessage({
      type: type.value,
      scope,
      subject,
      body,
      footer: ""
    });

    const git = simpleGit(cwd);

    // TODO: select which file should be add to workspace
    // wait VS Code implement the checkbox list API
    if (hasUncommitFiles) {
      // new file will not be stage
      // user should add them to stage space by manual
      await vscode.commands.executeCommand("git.stage");
    }

    const result = await (new Promise((resolve, reject) => {
      git.commit(message, (err: any, r: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(r);
      });
    }) as Promise<any>);

    // refresh git explorer
    await vscode.commands.executeCommand("git.refresh");

    // if success
    if (result.commit) {
      const action = this.i18n.localize("action.push");
      const r = await vscode.window.showInformationMessage(
        `Commit as ${result.commit}`,
        action
      );
      if (r && r === action) {
        this.push();
      }
    }
  }
  public async push() {
    await vscode.commands.executeCommand("git.push");
  }
  public async pull(): Promise<void> {
    await vscode.commands.executeCommand("git.pull");
  }
}
