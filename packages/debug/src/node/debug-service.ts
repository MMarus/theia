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

import { injectable, inject, named } from "inversify";
import { ContributionProvider, ILogger } from '@theia/core';
import {
    DebugService,
    DebugConfiguration
} from "../common/debug-common";

import { UUID } from "@phosphor/coreutils";
import { DebugAdapterContribution, DebugAdapterExecutable, DebugAdapterSession, DebugAdapterSessionFactory } from "./debug-model";

/**
 * Contributions registry.
 */
@injectable()
export class DebugAdapterContributionRegistry {
    protected readonly contribs = new Map<string, DebugAdapterContribution>();

    constructor(
        @inject(ContributionProvider) @named(DebugAdapterContribution)
        protected readonly contributions: ContributionProvider<DebugAdapterContribution>
    ) {
        for (const contrib of this.contributions.getContributions()) {
            this.contribs.set(contrib.debugType, contrib);
        }
    }

    /**
     * Finds and returns an array of registered debug types.
     * @returns An array of registered debug types
     */
    debugTypes(): string[] {
        return Array.from(this.contribs.keys());
    }

    /**
     * Provides initial [debug configuration](#DebugConfiguration).
     * @param debugType The registered debug type
     * @returns An array of [debug configurations](#DebugConfiguration)
     */
    provideDebugConfigurations(debugType: string): DebugConfiguration[] {
        const contrib = this.contribs.get(debugType);
        if (contrib) {
            return contrib.provideDebugConfigurations;
        }
        throw new Error(`Debug adapter '${debugType}' isn't registered.`);
    }

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values
     * or by adding/changing/removing attributes.
     * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
     * @returns The resolved debug configuration.
     */
    resolveDebugConfiguration(config: DebugConfiguration): DebugConfiguration {
        const contrib = this.contribs.get(config.type);
        if (contrib) {
            return contrib.resolveDebugConfiguration(config);
        }
        throw new Error(`Debug adapter '${config.type}' isn't registered.`);
    }

    /**
     * Provides a [debug adapter executable](#DebugAdapterExecutable)
     * based on [debug configuration](#DebugConfiguration) to launch a new debug adapter.
     * @param config The resolved [debug configuration](#DebugConfiguration).
     * @returns The [debug adapter executable](#DebugAdapterExecutable).
     */
    provideDebugAdapterExecutable(config: DebugConfiguration): DebugAdapterExecutable {
        const contrib = this.contribs.get(config.type);
        if (contrib) {
            return contrib.provideDebugAdapterExecutable(config);
        }
        throw new Error(`Debug adapter '${config.type}' isn't registered.`);
    }

    /**
     * Returns a [debug adapter session factory](#DebugAdapterSessionFactory).
     * @param debugType The registered debug type
     * @returns An [debug adapter session factory](#DebugAdapterSessionFactory)
     */
    debugAdapterSessionFactory(debugType: string): DebugAdapterSessionFactory | undefined {
        const contrib = this.contribs.get(debugType);
        if (contrib) {
            return contrib.debugAdapterSessionFactory;
        }
    }
}

/**
 * Debug adapter session manager.
 */
@injectable()
export class DebugAdapterSessionManager {
    protected readonly sessions = new Map<string, DebugAdapterSession>();

    constructor(
        @inject(DebugAdapterContributionRegistry)
        protected readonly registry: DebugAdapterContributionRegistry,
        @inject(DebugAdapterSessionFactory)
        protected readonly defaultFactory: DebugAdapterSessionFactory
    ) { }

    /**
     * Creates a new [debug adapter session](#DebugAdapterSession).
     * @param config The [DebugConfiguration](#DebugConfiguration)
     * @returns The debug adapter session
     */
    create(config: DebugConfiguration): DebugAdapterSession {
        const sessionId = UUID.uuid4();
        const factory = this.registry.debugAdapterSessionFactory(config.type) || this.defaultFactory;
        const executable = this.registry.provideDebugAdapterExecutable(config);
        const session = factory.get(sessionId, config, executable);
        this.sessions.set(sessionId, session);
        return session;
    }

    /**
     * Removes [debug adapter session](#DebugAdapterSession) from the list of the instantiated sessions.
     * Is invoked when session is terminated and isn't needed anymore.
     * @param sessionId The session identifier
     */
    remove(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    /**
     * Finds the debug adapter session by its id.
     * Returning the value 'undefined' means the session isn't found.
     * @param sessionId The session identifier
     * @returns The debug adapter session
     */
    find(sessionId: string): DebugAdapterSession | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * Finds all instantiated debug adapter sessions.
     * @returns An array of debug adapter sessions
     */
    findAll(): DebugAdapterSession[] {
        return Array.from(this.sessions.values());
    }
}

/**
 * DebugService implementation.
 */
@injectable()
export class DebugServiceImpl implements DebugService {
    constructor(
        @inject(ILogger)
        protected readonly logger: ILogger,
        @inject(DebugAdapterSessionManager)
        protected readonly sessionManager: DebugAdapterSessionManager,
        @inject(DebugAdapterContributionRegistry)
        protected readonly registry: DebugAdapterContributionRegistry) { }

    async debugTypes(): Promise<string[]> {
        return this.registry.debugTypes();
    }

    async provideDebugConfigurations(debugType: string): Promise<DebugConfiguration[]> {
        return this.registry.provideDebugConfigurations(debugType);
    }

    async resolveDebugConfiguration(config: DebugConfiguration): Promise<DebugConfiguration> {
        return this.registry.resolveDebugConfiguration(config);
    }

    async start(config: DebugConfiguration): Promise<string> {
        const session = this.sessionManager.create(config);
        return session.start().then(() => session.id);
    }

    async dispose(sessionId?: string): Promise<void> {
        if (sessionId) {
            const debugSession = this.sessionManager.find(sessionId);
            if (debugSession) {
                debugSession.stop();
            }
        } else {
            this.sessionManager.findAll().forEach(debugSession => debugSession.stop());
        }
    }
}
