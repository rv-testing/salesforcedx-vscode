/*
 * Copyright (c) 2017, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { ExecuteService } from '@salesforce/apex-node';
import { Connection } from '@salesforce/core';
import {
  CancelResponse,
  ContinueResponse,
  ParametersGatherer
} from '@salesforce/salesforcedx-utils-vscode/out/src/types';
import * as vscode from 'vscode';
import { channelService } from '../channels';
import { nls } from '../messages';
import { notificationService } from '../notifications';
import { telemetryService } from '../telemetry';
import { hasRootWorkspace } from '../util';
import {
  ApexLibraryExecutor,
  SfdxCommandlet,
  SfdxWorkspaceChecker
} from './util';

export class AnonApexGatherer
  implements ParametersGatherer<{ fileName?: string; apexCode?: string }> {
  public async gather(): Promise<
    CancelResponse | ContinueResponse<{ fileName?: string; apexCode?: string }>
  > {
    if (hasRootWorkspace()) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return { type: 'CANCEL' };
      }

      const document = editor.document;
      if (!editor.selection.isEmpty) {
        return {
          type: 'CONTINUE',
          data: { apexCode: document.getText(editor.selection) }
        };
      }

      return { type: 'CONTINUE', data: { fileName: document.uri.fsPath } };
    }
    return { type: 'CANCEL' };
  }
}

const workspaceChecker = new SfdxWorkspaceChecker();
const fileNameGatherer = new AnonApexGatherer();

export class ApexLibraryExecuteExecutor extends ApexLibraryExecutor {
  protected executeService: ExecuteService | undefined;

  public createService(conn: Connection): void {
    this.executeService = new ExecuteService(conn);
  }

  public async execute(
    response: ContinueResponse<{ fileName?: string; apexCode?: string }>
  ): Promise<void> {
    this.setStartTime();

    try {
      await this.build(
        nls.localize('apex_execute_text'),
        nls.localize('force_apex_execute_library')
      );

      if (this.executeService === undefined) {
        throw new Error('ExecuteService is not established');
      }

      this.executeService.executeAnonymous = this.executeWrapper(
        this.executeService.executeAnonymous
      );

      await this.executeService.executeAnonymous({
        ...(response.data.fileName && { apexFilePath: response.data.fileName }),
        ...(response.data.apexCode && { apexCode: response.data.apexCode })
      });
    } catch (e) {
      telemetryService.sendException('force_apex_execute_library', e.message);
      notificationService.showFailedExecution(this.executionName);
      channelService.appendLine(e.message);
    }
  }
}

export async function forceApexExecute() {
  const commandlet = new SfdxCommandlet(
    workspaceChecker,
    fileNameGatherer,
    new ApexLibraryExecuteExecutor()
  );
  await commandlet.run();
}
