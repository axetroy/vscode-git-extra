"use strict";
import "reflect-metadata";
import * as vscode from "vscode";
import { Container } from "typedi";
import Git from "./Git";

export async function activate(context: vscode.ExtensionContext) {
  Container.set("context", context);
  const git = Container.get(Git);

  context.subscriptions.push(
    vscode.commands.registerCommand("git-extra.commit", git.commit.bind(git))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("git-extra.pull", git.pull.bind(git))
  );
}

export function deactivate(context: vscode.ExtensionContext) {
  //
}
