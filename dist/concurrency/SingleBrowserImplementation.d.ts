import * as puppeteer from 'puppeteer';
import ConcurrencyImplementation, { ResourceData } from './ConcurrencyImplementation';
export default abstract class SingleBrowserImplementation extends ConcurrencyImplementation {
    protected browser: puppeteer.Browser | null;
    private repairing;
    private repairRequested;
    private openInstances;
    private waitingForRepairResolvers;
    constructor(options: puppeteer.ConnectOptions & {
        CreateInstanceFunc?: (bw: puppeteer.Browser, session?: any) => Promise<puppeteer.Page>;
        session?: any;
    }, puppeteer: any);
    private repair;
    init(): Promise<void>;
    close(): Promise<void>;
    protected abstract createResources(): Promise<ResourceData>;
    protected abstract freeResources(resources: ResourceData): Promise<void>;
    workerInstance(): Promise<{
        jobInstance: () => Promise<{
            resources: ResourceData;
            close: () => Promise<void>;
        }>;
        close: () => Promise<void>;
        repair: () => Promise<void>;
    }>;
}
