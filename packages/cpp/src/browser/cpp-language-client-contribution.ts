/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from "inversify";
import {
    BaseLanguageClientContribution, LanguageClientFactory,
    LanguageClientOptions,
    ILanguageClient
} from '@theia/languages/lib/browser';
import { Languages, Workspace, DidChangeConfigurationParams, DidChangeConfigurationNotification } from "@theia/languages/lib/common";
import { ILogger } from '@theia/core/lib/common/logger';
import { MessageService } from '@theia/core/lib/common/message-service';
import { CPP_LANGUAGE_ID, CPP_LANGUAGE_NAME, HEADER_AND_SOURCE_FILE_EXTENSIONS } from '../common';
import { CppBuildConfigurationManager, CppBuildConfiguration } from "./cpp-build-configurations";

@injectable()
export class CppLanguageClientContribution extends BaseLanguageClientContribution {

    readonly id = CPP_LANGUAGE_ID;
    readonly name = CPP_LANGUAGE_NAME;

    @inject(CppBuildConfigurationManager)
    protected readonly cppBuildConfigurations: CppBuildConfigurationManager;

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(LanguageClientFactory) protected readonly languageClientFactory: LanguageClientFactory,
        @inject(MessageService) protected readonly messageService: MessageService,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        super(workspace, languages, languageClientFactory);
    }

    protected onReady(languageClient: ILanguageClient): void {
        super.onReady(languageClient);

        // When the language server is ready, send the active build
        // configuration so it knows where to find the build commands
        // (e.g. compile_commands.json).
        this.onActiveBuildConfigChanged(this.cppBuildConfigurations.getActiveConfig());
        this.cppBuildConfigurations.onActiveConfigChange(config => this.onActiveBuildConfigChanged(config));
    }

    async onActiveBuildConfigChanged(config: CppBuildConfiguration | undefined) {
        const interfaceParams: DidChangeConfigurationParams = {
            settings: {
                compilationDatabasePath: config ? config.directory : undefined,
            },
        };

        const languageClient = await this.languageClient;
        languageClient.sendNotification(DidChangeConfigurationNotification.type, interfaceParams);
    }

    protected get documentSelector() {
        // This is used (at least) to determine which files, when they are open,
        // trigger the launch of the C/C++ language server.
        return HEADER_AND_SOURCE_FILE_EXTENSIONS;
    }

    protected get globPatterns() {
        // This is used (at least) to determine which files we watch.  Change
        // notifications are forwarded to the language server.
        return [
            '**/*.{' + HEADER_AND_SOURCE_FILE_EXTENSIONS.join() + '}',
            '**/compile_commands.json',
        ];
    }

    protected createOptions(): LanguageClientOptions {
        const clientOptions = super.createOptions();
        clientOptions.initializationFailedHandler = () => {
            const READ_INSTRUCTIONS_ACTION = "Read Instructions";
            const ERROR_MESSAGE = "Error starting C/C++ language server. " +
                "Please make sure 'clangd' is installed on your system. " +
                "You can refer to the clangd page for instructions.";
            this.messageService.error(ERROR_MESSAGE, READ_INSTRUCTIONS_ACTION).then(selected => {
                if (READ_INSTRUCTIONS_ACTION === selected) {
                    window.open("https://clang.llvm.org/extra/clangd.html");
                }
            });
            this.logger.error(ERROR_MESSAGE);
            return false;
        };
        return clientOptions;
    }
}
