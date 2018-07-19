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

import { inject, injectable } from 'inversify';
import Axios, { AxiosResponse } from 'axios';
import URI from '../../common/uri';
import {
    Command, CommandContribution, CommandRegistry,
    MenuModelRegistry, MenuContribution, ILogger
} from '../../common';
import {
    StorageService, KeybindingContribution, KeybindingRegistry,
    QuickOpenService, QuickOpenModel, QuickOpenItem, QuickOpenMode, QuickOpenGroupItem, QuickOpenGroupItemOptions
} from '../../browser';
import { CommonMenus } from '../../browser';
import { WindowService } from '../../browser/window/window-service';
import { timeout as delay } from '../../common/promise-util';
import { ConnectionStateService } from './connection-state-service';

export enum RemoteEntryGroups {
    Input = 0,
    Autocomplete,
    History,
}

// tslint:disable-next-line:no-any
export type Response<T = any> = AxiosResponse<T>;
export interface RemoteEntry {
    url: string;

    group?: string;
    response?: Response;

    poll(timeout?: number): Promise<Response>;

    hasError(): boolean;
    hasResponse(): boolean;
    isOk(): boolean;

    getStatusText(): string;

    clear(): void;
}
export class CachedRemoteEntry implements RemoteEntry {

    protected _response?: Response;
    protected _error?: Error;

    constructor(
        public url: string,
        public group?: string,
    ) { }

    async poll(timeout?: number): Promise<Response> {
        if (this._error) {
            throw this._error;
        }
        if (this._response) {
            return this._response;
        }
        try {
            return this._response = await Axios.get(this.url, { timeout });
        } catch (error) {
            throw this._error = error;
        }
    }

    get response(): CachedRemoteEntry['_response'] {
        if (this._error) {
            throw this._error;
        }
        return this._response;
    }

    hasError(): boolean {
        return typeof this._error !== 'undefined';
    }

    hasResponse(): boolean {
        return typeof this.response !== 'undefined';
    }

    isOk(): boolean {
        return !this.hasError()
            && this.hasResponse()
            && /^2/.test(this.response!.status.toString());
    }

    getStatusText(): string {
        try {
            const response = this.response;
            if (response) {
                return response.statusText || 'Online';
            }
            return 'Unresolved';
        } catch (error) {
            return error.message;
        }
    }

    clear(): void {
        this._response = undefined;
        this._error = undefined;
    }
}

@injectable()
export class ElectronRemoteContribution implements QuickOpenModel, CommandContribution, MenuContribution, KeybindingContribution {

    @inject(ConnectionStateService) protected readonly connectionState: ConnectionStateService;
    @inject(StorageService) protected readonly localStorageService: StorageService;
    @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService;
    @inject(WindowService) protected readonly windowService: WindowService;
    @inject(ILogger) protected readonly logger: ILogger;

    protected historyEntries: Promise<RemoteEntry[]>;
    protected timeout: number = 500; // ms

    protected get history(): Promise<string[]> {
        return this.localStorageService.getData<string[]>(ElectronRemoteHistory.KEY, [])
            .then(history => history.map(entry => decodeURI(entry)));
    }

    protected async remember(url: string): Promise<void> {
        const history = await this.localStorageService.getData<string[]>(ElectronRemoteHistory.KEY, []);
        const encoded = encodeURI(url);
        if (encoded) {
            const currentIndex = history.indexOf(encoded);
            if (currentIndex === -1) {
                history.unshift(encoded);
            }

            this.localStorageService.setData(ElectronRemoteHistory.KEY, history);
        }
    }

    protected async clearHistory(): Promise<void> {
        return this.localStorageService.setData(ElectronRemoteHistory.KEY, undefined);
    }

    protected async computeHistoryCache(): Promise<RemoteEntry[]> {
        const history = (await this.history).map(url => new CachedRemoteEntry(url, RemoteEntryGroups[RemoteEntryGroups.History]));
        return this.accumulateResponses(history, this.timeout);
    }

    protected async accumulateResponses(input: RemoteEntry[], timeout: number): Promise<RemoteEntry[]> {
        const output: RemoteEntry[] = [];
        Promise.all(input
            .map(async entry => {
                await entry.poll(timeout).catch(e => void 0);
                output.push(entry);
            })
        );
        await delay(timeout);
        return output.slice(0);
    }

    protected urlOpener = (url: string) => (mode: QuickOpenMode): boolean => {
        if (mode === QuickOpenMode.OPEN) {
            this.windowService.openNewWindow(url);
            this.remember(url);
        }
        return true;
    }

    protected convertEntryToQuickOpenItem(entry: RemoteEntry, override: QuickOpenGroupItemOptions = {}): QuickOpenItem {
        return new QuickOpenGroupItem({
            label: entry.url,
            groupLabel: entry.group,
            description: entry.getStatusText(),
            run: this.urlOpener(entry.url),
            ...override,
        });
    }

    async onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): Promise<void> {
        const defaultSchemes = ['http', 'https'];
        const inputResponses = [];
        const inputEntries = [];
        const items: QuickOpenItem[] = [];

        // Add a way to open a local electron window
        if (this.connectionState.isRemote()) {
            items.push(new QuickOpenGroupItem({
                label: 'Localhost Application',
                groupLabel: 'Electron',
                description: 'Electron',
                run: this.urlOpener('localhost'),
            }));
        }

        if (lookFor) {
            let url = new URI(lookFor);

            // Autocompletion (http/https) if not using http(s) filescheme
            if (!/^https?$/.test(url.scheme)) {
                const reformated = new URI(`//${lookFor}`);
                for (const scheme of defaultSchemes) {
                    url = reformated.withScheme(scheme);
                    inputEntries.push(
                        new CachedRemoteEntry(url.toString(), RemoteEntryGroups[RemoteEntryGroups.Autocomplete])
                    );
                }
            } else {
                inputEntries.push(
                    new CachedRemoteEntry(url.toString(), RemoteEntryGroups[RemoteEntryGroups.Input])
                );
            }

            // Host polling
            inputResponses.push(...await this.accumulateResponses(inputEntries, this.timeout));
        }

        // Sorting the autocompletion and history based on the status of the responses
        const sortedEntries = [...inputResponses, ...await this.historyEntries]
            // make unique
            .filter((entry, index, array) => array.findIndex(e => e.url === entry.url) === index)
            // place OK responses first
            .sort((a, b) => {
                if (a.isOk() === b.isOk()) {
                    return 0;
                } else if (a.isOk()) {
                    return -1;
                } else {
                    return 1;
                }
            })
            // place a separator between OK and Error responses
            .map((entry, index, array) => {
                const previous = array[index - 1];
                const options: QuickOpenGroupItemOptions = {};
                if (previous && previous.isOk() && !entry.isOk()) {
                    options.showBorder = true;
                }
                return this.convertEntryToQuickOpenItem(entry, options);
            });

        items.push(...sortedEntries);
        acceptor(items);
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(ElectronRemoteCommands.CONNECT_TO_REMOTE, {
            execute: () => {
                this.historyEntries = this.computeHistoryCache();
                this.quickOpenService.open(this, {
                    placeholder: 'Type the URL to connect to...',
                    fuzzyMatchLabel: true,
                });
            }
        });

        registry.registerCommand(ElectronRemoteCommands.DISCONNECT_FROM_REMOTE, {
            isEnabled: () => this.connectionState.isRemote(),
            isVisible: () => this.connectionState.isRemote(),
            execute: () => {
                this.windowService.openNewWindow('localhost');
                close();
            },
        });
        registry.registerCommand(ElectronRemoteCommands.CLEAR_REMOTE_HISTORY, {
            execute: () => this.clearHistory()
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybindings({
            command: ElectronRemoteCommands.CONNECT_TO_REMOTE.id,
            keybinding: "ctrl+alt+r"
        });
    }

    registerMenus(registry: MenuModelRegistry) {
        registry.registerMenuAction(ElectronMenus.ELECTRON_REMOTE, {
            commandId: ElectronRemoteCommands.CONNECT_TO_REMOTE.id,
            order: 'z4',
        });
        // Do not load the disconnect button if we are not on a remote server
        if (this.connectionState.isRemote()) {
            registry.registerMenuAction(ElectronMenus.ELECTRON_REMOTE, {
                commandId: ElectronRemoteCommands.DISCONNECT_FROM_REMOTE.id,
                order: 'z5',
            });
        }
    }
}

export namespace ElectronRemoteCommands {
    export const CONNECT_TO_REMOTE: Command = {
        id: 'electron.remote.connect',
        label: 'Remote: Connect to a Server'
    };
    export const CLEAR_REMOTE_HISTORY: Command = {
        id: 'electron.remote.history.clear',
        label: 'Remote: Clear host history'
    };
    export const DISCONNECT_FROM_REMOTE: Command = {
        id: 'electron.remote.disconnect',
        label: 'Remote: Disconnect',
    };
}

export namespace ElectronMenus {
    export const ELECTRON_REMOTE = [...CommonMenus.FILE_OPEN, 'z_connect'];
}

export namespace ElectronRemoteHistory {
    export const KEY = 'theia.remote.history';
}
