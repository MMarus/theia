/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { injectable, inject } from "inversify";
import { CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from "@theia/core/lib/common";
import { MAIN_MENU_BAR } from "@theia/core/lib/common/menu";
import { DebugService } from "../common/debug-model";
import { DebugClientManager } from "./debug-client";
import { DebugConfigurationManager } from "./debug-configuration";

export namespace DebugMenus {
    export const DEBUG = [...MAIN_MENU_BAR, "4_debug"];
    export const DEBUG_STOP = [...DEBUG, '2_stop'];
    export const DEBUG_START = [...DEBUG_STOP, '1_start'];
    export const ADD_CONFIGURATION = [...DEBUG, '4_add_configuration'];
    export const OPEN_CONFIGURATION = [...ADD_CONFIGURATION, '3_open_configuration'];
}

export namespace DEBUG_COMMANDS {
    export const START = {
        id: 'debug.start',
        label: 'Start'
    };

    export const STOP = {
        id: 'debug.stop',
        label: 'Stop'
    };

    export const OPEN_CONFIGURATION = {
        id: 'debug.configuration.open',
        label: 'Open configuration'
    };

    export const ADD_CONFIGURATION = {
        id: 'debug.configuration.add',
        label: 'Add configuration'
    };
}

@injectable()
export class DebugCommandHandlers implements MenuContribution, CommandContribution {
    @inject(DebugService)
    protected readonly debug: DebugService;
    @inject(DebugClientManager)
    protected readonly debugClientManager: DebugClientManager;
    @inject(DebugConfigurationManager)
    protected readonly debugConfigurationManager: DebugConfigurationManager;

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerSubmenu(DebugMenus.DEBUG, 'Debug');
        menus.registerMenuAction(DebugMenus.DEBUG_START, {
            commandId: DEBUG_COMMANDS.START.id
        });
        menus.registerMenuAction(DebugMenus.DEBUG_STOP, {
            commandId: DEBUG_COMMANDS.STOP.id
        });
        menus.registerMenuAction(DebugMenus.OPEN_CONFIGURATION, {
            commandId: DEBUG_COMMANDS.OPEN_CONFIGURATION.id
        });
        menus.registerMenuAction(DebugMenus.ADD_CONFIGURATION, {
            commandId: DEBUG_COMMANDS.ADD_CONFIGURATION.id
        });
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(DEBUG_COMMANDS.START);
        registry.registerHandler(DEBUG_COMMANDS.START.id, {
            execute: () => {
                this.debugConfigurationManager.getConfiguration()
                    .then(configuration => this.debug.resolveDebugConfiguration(configuration))
                    .then((configuration) => {
                        if (configuration) {
                            return this.debug.startDebugSession(configuration);
                        }
                        return Promise.reject("Debug configuration isn't resolved");
                    })
                    .then(sessionId => {
                        const debugClient = this.debugClientManager.create(sessionId);
                        return debugClient.connect().then(() => debugClient);
                    })
                    .then(debugClient => {
                        this.debugClientManager.setActiveDebugClient(debugClient);
                        debugClient.sendRequest("initialize");
                    });
            },
            isEnabled: () => this.debugClientManager.getActiveDebugClient() === undefined,
            isVisible: () => true
        });

        registry.registerCommand(DEBUG_COMMANDS.STOP);
        registry.registerHandler(DEBUG_COMMANDS.STOP.id, {
            execute: () => {
                const debugClient = this.debugClientManager.getActiveDebugClient();
                if (debugClient) {
                    debugClient.dispose();
                    this.debugClientManager.remove(debugClient.sessionId);
                }
            },
            isEnabled: () => this.debugClientManager.getActiveDebugClient() !== undefined,
            isVisible: () => true
        });

        registry.registerCommand(DEBUG_COMMANDS.OPEN_CONFIGURATION);
        registry.registerHandler(DEBUG_COMMANDS.OPEN_CONFIGURATION.id, {
            execute: () => this.debugConfigurationManager.openConfigurationFile(),
            isEnabled: () => true,
            isVisible: () => true
        });

        registry.registerCommand(DEBUG_COMMANDS.ADD_CONFIGURATION);
        registry.registerHandler(DEBUG_COMMANDS.ADD_CONFIGURATION.id, {
            execute: () => this.debugConfigurationManager.addConfiguration(),
            isEnabled: () => true,
            isVisible: () => true
        });
    }
}
