import { createAPIApp } from './src/App';
import { serve } from '@hono/node-server';
import { loadConfig } from '../config/src/ConfigLoader';
import { initializeConfig } from './src/Config';
import { initializeLogger } from './src/Logger';

async function boot() {
    console.log("🛰️ Initializing Multiverse Core...");
    try {
        const rawConfig = await loadConfig();
        
        const forcedConfig = {
            ...rawConfig,
            kv: {
                url: "redis://127.0.0.1:6379",
                mode: "single",
                clusterNodes: [],
                clusterNatMap: {}
            },
            nats: {
                url: "nats://127.0.0.1:4222"
            },
            search: {
                url: "http://127.0.0.1:7700",
                api_key: "sovereign-search-key"
            },
            voice: {
                enabled: false,
                defaultRegion: "us-east-1"
            },
            stripe: {
                enabled: false
            },
            dev: {
                testModeEnabled: false
            }
        };

        const logger = {
            info: (msg: any, ...args: any[]) => console.log(`[INFO] `, msg, ...args),
            error: (msg: any, ...args: any[]) => console.error(`[ERROR] `, msg, ...args),
            warn: (msg: any, ...args: any[]) => console.warn(`[WARN] `, msg, ...args),
            debug: (msg: any, ...args: any[]) => console.debug(`[DEBUG] `, msg, ...args)
        };

        console.log("🔒 Locking Global Configuration & Logger...");
        initializeConfig(forcedConfig as any);
        initializeLogger(logger as any);
        
        const api = await createAPIApp({ config: forcedConfig as any, logger });
        
        console.log("⛓️ Initializing Services (Database/Cache/NATS)...");
        await api.initialize();
        
        serve({
            fetch: api.app.fetch,
            port: 8080
        }, (info) => {
            console.log(`🚀 Multiverse API Sovereign on port ${info.port}`);
        });
    } catch (err) {
        console.error("💥 Boot Failure:", err);
    }
}

boot().catch(err => {
    console.error("💥 Critical Launcher Failure:", err);
    process.exit(1);
});
