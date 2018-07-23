/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject, postConstruct } from "inversify";
import { OutputChannel, OutputChannelManager } from "@theia/output/lib/common/output-channel";
import { HostedPluginWatcher } from './hosted-plugin-watcher';
import { LogPart } from "../../common/types";

@injectable()
export class HostedPluginLogViewer {
    public static OUTPUT_CHANNEL_NAME = 'hosted-instance-log';

    @inject(HostedPluginWatcher)
    protected readonly watcher: HostedPluginWatcher;
    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;

    protected channel: OutputChannel;

    showLogConsole(): void {
        this.channel.setVisibility(true);
    }

    @postConstruct()
    protected init() {
        this.channel = this.outputChannelManager.getChannel(HostedPluginLogViewer.OUTPUT_CHANNEL_NAME);
        this.watcher.onLogMessageEvent(event => this.logMessageEventHandler(event));
    }

    protected logMessageEventHandler(event: LogPart): void {
        console.log('>>>>>>', event.data);
        this.channel.appendLine(event.data);
    }

}
