/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { injectable } from 'inversify';

export enum ConnectionType {
    Local = 0,
    Remote,
}

export const ConnectionStateService = Symbol('ConnectionStateService');
export interface ConnectionStateService {
    getState(): string;
    isLocal(): boolean;
    isRemote(): boolean;
}

@injectable()
export class DefaultConnectionStateService {

    protected state: ConnectionType = /^file:/.test(self.location.href) ? ConnectionType.Local : ConnectionType.Remote;

    getState(): string {
        return ConnectionType[this.state];
    }

    isLocal(): boolean {
        return this.state === ConnectionType.Local;
    }

    isRemote(): boolean {
        return this.state === ConnectionType.Remote;
    }
}
