"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const Job_1 = require("./Job");
const Display_1 = require("./Display");
const util = require("./util");
const Worker_1 = require("./Worker");
const builtInConcurrency = require("./concurrency/builtInConcurrency");
const Queue_1 = require("./Queue");
const SystemMonitor_1 = require("./SystemMonitor");
const events_1 = require("events");
const debug = util.debugGenerator('Cluster');
const DEFAULT_OPTIONS = {
    concurrency: 2,
    maxConcurrency: 1,
    workerCreationDelay: 0,
    puppeteerOptions: {
        CreateInstanceFunc: undefined,
        session: null
        // headless: false, // just for testing...
    },
    perBrowserOptions: undefined,
    monitor: false,
    timeout: 30 * 1000,
    retryLimit: 0,
    retryDelay: 0,
    skipDuplicateUrls: false,
    sameDomainDelay: 0,
    puppeteer: undefined,
};
const MONITORING_DISPLAY_INTERVAL = 500;
const CHECK_FOR_WORK_INTERVAL = 100;
const WORK_CALL_INTERVAL_LIMIT = 10;
class Cluster extends events_1.EventEmitter {
    static launch(options) {
        return __awaiter(this, void 0, void 0, function* () {
            debug('Launching');
            const cluster = new Cluster(options);
            yield cluster.init();
            return cluster;
        });
    }
    constructor(options) {
        super();
        this.perBrowserOptions = null;
        this.workers = [];
        this.workersAvail = [];
        this.workersBusy = [];
        this.workersStarting = 0;
        this.allTargetCount = 0;
        this.jobQueue = new Queue_1.default();
        this.errorCount = 0;
        this.taskFunction = null;
        this.idleResolvers = [];
        this.waitForOneResolvers = [];
        this.browser = null;
        this.isClosed = false;
        this.startTime = Date.now();
        this.nextWorkerId = -1;
        this.monitoringInterval = null;
        this.display = null;
        this.duplicateCheckUrls = new Set();
        this.lastDomainAccesses = new Map();
        this.systemMonitor = new SystemMonitor_1.default();
        this.checkForWorkInterval = null;
        this.nextWorkCall = 0;
        this.workCallTimeout = null;
        this.lastLaunchedWorkerTime = 0;
        this.options = Object.assign(Object.assign({}, DEFAULT_OPTIONS), options);
        if (this.options.monitor) {
            this.monitoringInterval = setInterval(() => this.monitor(), MONITORING_DISPLAY_INTERVAL);
        }
    }
    init() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const browserOptions = this.options.puppeteerOptions;
            let puppeteer = this.options.puppeteer;
            if (this.options.puppeteer == null) { // check for null or undefined
                puppeteer = require('puppeteer');
            }
            else {
                debug('Using provided (custom) puppteer object.');
            }
            if (this.options.concurrency === Cluster.CONCURRENCY_PAGE) {
                this.browser = new builtInConcurrency.Page(browserOptions, puppeteer);
            }
            else if (this.options.concurrency === Cluster.CONCURRENCY_CONTEXT) {
                this.browser = new builtInConcurrency.Context(browserOptions, puppeteer);
            }
            else if (this.options.concurrency === Cluster.CONCURRENCY_BROWSER) {
                this.browser = new builtInConcurrency.Browser(browserOptions, puppeteer);
            }
            else if (typeof this.options.concurrency === 'function') {
                this.browser = new this.options.concurrency(browserOptions, puppeteer);
            }
            else {
                throw new Error(`Unknown concurrency option: ${this.options.concurrency}`);
            }
            if (typeof this.options.maxConcurrency !== 'number') {
                throw new Error('maxConcurrency must be of number type');
            }
            if (this.options.perBrowserOptions
                && this.options.perBrowserOptions.length !== this.options.maxConcurrency) {
                throw new Error('perBrowserOptions length must equal maxConcurrency');
            }
            if (this.options.perBrowserOptions) {
                this.perBrowserOptions = [...this.options.perBrowserOptions];
            }
            try {
                yield ((_a = this.browser) === null || _a === void 0 ? void 0 : _a.init());
            }
            catch (err) {
                throw new Error(`Unable to launch browser, error message: ${err.message}`);
            }
            if (this.options.monitor) {
                yield this.systemMonitor.init();
            }
            // needed in case resources are getting free (like CPU/memory) to check if
            // can launch workers
            this.checkForWorkInterval = setInterval(() => this.work(), CHECK_FOR_WORK_INTERVAL);
        });
    }
    launchWorker() {
        return __awaiter(this, void 0, void 0, function* () {
            // signal, that we are starting a worker
            this.workersStarting += 1;
            this.nextWorkerId += 1;
            this.lastLaunchedWorkerTime = Date.now();
            let nextWorkerOption;
            if (this.perBrowserOptions && this.perBrowserOptions.length > 0) {
                nextWorkerOption = this.perBrowserOptions.shift();
            }
            const workerId = this.nextWorkerId;
            let workerBrowserInstance;
            try {
                workerBrowserInstance = yield this.browser
                    .workerInstance(nextWorkerOption);
            }
            catch (err) {
                throw new Error(`Unable to launch browser for worker, error message: ${err.message}`);
            }
            const worker = new Worker_1.default({
                cluster: this,
                args: [''],
                browser: workerBrowserInstance,
                id: workerId,
            });
            this.workersStarting -= 1;
            if (this.isClosed) {
                // cluster was closed while we created a new worker (should rarely happen)
                worker.close();
            }
            else {
                this.workersAvail.push(worker);
                this.workers.push(worker);
            }
        });
    }
    task(taskFunction) {
        return __awaiter(this, void 0, void 0, function* () {
            this.taskFunction = taskFunction;
        });
    }
    // check for new work soon (wait if there will be put more data into the queue, first)
    work() {
        return __awaiter(this, void 0, void 0, function* () {
            // make sure, we only call work once every WORK_CALL_INTERVAL_LIMIT (currently: 10ms)
            if (this.workCallTimeout === null) {
                const now = Date.now();
                // calculate when the next work call should happen
                this.nextWorkCall = Math.max(this.nextWorkCall + WORK_CALL_INTERVAL_LIMIT, now);
                const timeUntilNextWorkCall = this.nextWorkCall - now;
                this.workCallTimeout = setTimeout(() => {
                    this.workCallTimeout = null;
                    this.doWork();
                }, timeUntilNextWorkCall);
            }
        });
    }
    doWork() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.jobQueue.size() === 0) { // no jobs available
                if (this.workersBusy.length === 0) {
                    this.idleResolvers.forEach(resolve => resolve());
                }
                return;
            }
            if (this.workersAvail.length === 0) { // no workers available
                if (this.allowedToStartWorker()) {
                    yield this.launchWorker();
                    this.work();
                }
                return;
            }
            const job = this.jobQueue.shift();
            if (job === undefined) {
                // skip, there are items in the queue but they are all delayed
                return;
            }
            const url = job.getUrl();
            const domain = job.getDomain();
            // Check if URL was already crawled (on skipDuplicateUrls)
            if (this.options.skipDuplicateUrls
                && url !== undefined && this.duplicateCheckUrls.has(url)) {
                // already crawled, just ignore
                debug(`Skipping duplicate URL: ${job.getUrl()}`);
                this.work();
                return;
            }
            // Check if the job needs to be delayed due to sameDomainDelay
            if (this.options.sameDomainDelay !== 0 && domain !== undefined) {
                const lastDomainAccess = this.lastDomainAccesses.get(domain);
                if (lastDomainAccess !== undefined
                    && lastDomainAccess + this.options.sameDomainDelay > Date.now()) {
                    this.jobQueue.push(job, {
                        delayUntil: lastDomainAccess + this.options.sameDomainDelay,
                    });
                    this.work();
                    return;
                }
            }
            // Check are all positive, let's actually run the job
            if (this.options.skipDuplicateUrls && url !== undefined) {
                this.duplicateCheckUrls.add(url);
            }
            if (this.options.sameDomainDelay !== 0 && domain !== undefined) {
                this.lastDomainAccesses.set(domain, Date.now());
            }
            const worker = this.workersAvail.shift();
            this.workersBusy.push(worker);
            if (this.workersAvail.length !== 0 || this.allowedToStartWorker()) {
                // we can execute more work in parallel
                this.work();
            }
            let jobFunction;
            if (job.taskFunction !== undefined) {
                jobFunction = job.taskFunction;
            }
            else if (this.taskFunction !== null) {
                jobFunction = this.taskFunction;
            }
            else {
                throw new Error('No task function defined!');
            }
            const result = yield worker.handle(jobFunction, job, this.options.timeout);
            if (result.type === 'error') {
                if (job.executeCallbacks) {
                    job.executeCallbacks.reject(result.error);
                    this.errorCount += 1;
                }
                else { // ignore retryLimits in case of executeCallbacks
                    job.addError(result.error);
                    const jobWillRetry = job.tries <= this.options.retryLimit;
                    this.emit('taskerror', result.error, job.data, jobWillRetry);
                    if (jobWillRetry) {
                        let delayUntil = undefined;
                        if (this.options.retryDelay !== 0) {
                            delayUntil = Date.now() + this.options.retryDelay;
                        }
                        this.jobQueue.push(job, {
                            delayUntil,
                        });
                    }
                    else {
                        this.errorCount += 1;
                    }
                }
            }
            else if (result.type === 'success' && job.executeCallbacks) {
                job.executeCallbacks.resolve(result.data);
            }
            this.waitForOneResolvers.forEach(resolve => resolve(job.data));
            this.waitForOneResolvers = [];
            // add worker to available workers again
            const workerIndex = this.workersBusy.indexOf(worker);
            this.workersBusy.splice(workerIndex, 1);
            this.workersAvail.push(worker);
            this.work();
        });
    }
    allowedToStartWorker() {
        const workerCount = this.workers.length + this.workersStarting;
        return (
        // option: maxConcurrency
        (this.options.maxConcurrency === 0
            || workerCount < this.options.maxConcurrency)
            // just allow worker creaton every few milliseconds
            && (this.options.workerCreationDelay === 0
                || this.lastLaunchedWorkerTime + this.options.workerCreationDelay < Date.now()));
    }
    // Type Guard for TypeScript
    isTaskFunction(data) {
        return (typeof data === 'function');
    }
    queueJob(data, taskFunction, callbacks) {
        let realData;
        let realFunction;
        if (this.isTaskFunction(data)) {
            realFunction = data;
        }
        else {
            realData = data;
            realFunction = taskFunction;
        }
        const job = new Job_1.default(realData, realFunction, callbacks);
        this.allTargetCount += 1;
        this.jobQueue.push(job);
        this.emit('queue', realData, realFunction);
        this.work();
    }
    queue(data, taskFunction) {
        return __awaiter(this, void 0, void 0, function* () {
            this.queueJob(data, taskFunction);
        });
    }
    execute(data, taskFunction) {
        return new Promise((resolve, reject) => {
            const callbacks = { resolve, reject };
            this.queueJob(data, taskFunction, callbacks);
        });
    }
    idle() {
        return new Promise(resolve => this.idleResolvers.push(resolve));
    }
    waitForOne() {
        return new Promise(resolve => this.waitForOneResolvers.push(resolve));
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            this.isClosed = true;
            clearInterval(this.checkForWorkInterval);
            clearTimeout(this.workCallTimeout);
            // close workers
            yield Promise.all(this.workers.map(worker => worker.close()));
            try {
                yield this.browser.close();
            }
            catch (err) {
                debug(`Error: Unable to close browser, message: ${err.message}`);
            }
            if (this.monitoringInterval) {
                this.monitor();
                clearInterval(this.monitoringInterval);
            }
            if (this.display) {
                this.display.close();
            }
            this.systemMonitor.close();
            debug('Closed');
        });
    }
    monitor() {
        if (!this.display) {
            this.display = new Display_1.default();
        }
        const display = this.display;
        const now = Date.now();
        const timeDiff = now - this.startTime;
        const doneTargets = this.allTargetCount - this.jobQueue.size() - this.workersBusy.length;
        const donePercentage = this.allTargetCount === 0
            ? 1 : (doneTargets / this.allTargetCount);
        const donePercStr = (100 * donePercentage).toFixed(2);
        const errorPerc = doneTargets === 0 ?
            '0.00' : (100 * this.errorCount / doneTargets).toFixed(2);
        const timeRunning = util.formatDuration(timeDiff);
        let timeRemainingMillis = -1;
        if (donePercentage !== 0) {
            timeRemainingMillis = ((timeDiff) / donePercentage) - timeDiff;
        }
        const timeRemining = util.formatDuration(timeRemainingMillis);
        const cpuUsage = this.systemMonitor.getCpuUsage().toFixed(1);
        const memoryUsage = this.systemMonitor.getMemoryUsage().toFixed(1);
        const pagesPerSecond = doneTargets === 0 ?
            '0' : (doneTargets * 1000 / timeDiff).toFixed(2);
        display.log(`== Start:     ${util.formatDateTime(this.startTime)}`);
        display.log(`== Now:       ${util.formatDateTime(now)} (running for ${timeRunning})`);
        display.log(`== Progress:  ${doneTargets} / ${this.allTargetCount} (${donePercStr}%)`
            + `, errors: ${this.errorCount} (${errorPerc}%)`);
        display.log(`== Remaining: ${timeRemining} (@ ${pagesPerSecond} pages/second)`);
        display.log(`== Sys. load: ${cpuUsage}% CPU / ${memoryUsage}% memory`);
        display.log(`== Workers:   ${this.workers.length + this.workersStarting}`);
        this.workers.forEach((worker, i) => {
            const isIdle = this.workersAvail.indexOf(worker) !== -1;
            let workOrIdle;
            let workerUrl = '';
            if (isIdle) {
                workOrIdle = 'IDLE';
            }
            else {
                workOrIdle = 'WORK';
                if (worker.activeTarget) {
                    workerUrl = worker.activeTarget.getUrl() || 'UNKNOWN TARGET';
                }
                else {
                    workerUrl = 'NO TARGET (should not be happening)';
                }
            }
            display.log(`   #${i} ${workOrIdle} ${workerUrl}`);
        });
        for (let i = 0; i < this.workersStarting; i += 1) {
            display.log(`   #${this.workers.length + i} STARTING...`);
        }
        display.resetCursor();
    }
}
exports.default = Cluster;
Cluster.CONCURRENCY_PAGE = 1; // shares cookies, etc.
Cluster.CONCURRENCY_CONTEXT = 2; // no cookie sharing (uses contexts)
Cluster.CONCURRENCY_BROWSER = 3; // no cookie sharing and individual processes (uses contexts)
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2x1c3Rlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9DbHVzdGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBQ0EsK0JBQTZFO0FBQzdFLHVDQUFnQztBQUNoQywrQkFBK0I7QUFDL0IscUNBQThDO0FBRTlDLHVFQUF1RTtBQUd2RSxtQ0FBNEI7QUFDNUIsbURBQTRDO0FBQzVDLG1DQUFzQztBQUt0QyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBdUI3QyxNQUFNLGVBQWUsR0FBbUI7SUFDcEMsV0FBVyxFQUFFLENBQUM7SUFDZCxjQUFjLEVBQUUsQ0FBQztJQUNqQixtQkFBbUIsRUFBRSxDQUFDO0lBQ3RCLGdCQUFnQixFQUFFO1FBQ2Qsa0JBQWtCLEVBQUUsU0FBUztRQUM3QixPQUFPLEVBQUUsSUFBSTtRQUNiLDBDQUEwQztLQUM3QztJQUNELGlCQUFpQixFQUFFLFNBQVM7SUFDNUIsT0FBTyxFQUFFLEtBQUs7SUFDZCxPQUFPLEVBQUUsRUFBRSxHQUFHLElBQUk7SUFDbEIsVUFBVSxFQUFFLENBQUM7SUFDYixVQUFVLEVBQUUsQ0FBQztJQUNiLGlCQUFpQixFQUFFLEtBQUs7SUFDeEIsZUFBZSxFQUFFLENBQUM7SUFDbEIsU0FBUyxFQUFFLFNBQVM7Q0FDdkIsQ0FBQztBQWNGLE1BQU0sMkJBQTJCLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLE1BQU0sdUJBQXVCLEdBQUcsR0FBRyxDQUFDO0FBQ3BDLE1BQU0sd0JBQXdCLEdBQUcsRUFBRSxDQUFDO0FBRXBDLE1BQXFCLE9BQXlDLFNBQVEscUJBQVk7SUFvQ3ZFLE1BQU0sQ0FBTyxNQUFNLENBQUMsT0FBK0I7O1lBQ3RELEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNuQixNQUFNLE9BQU8sR0FBRyxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNyQyxNQUFNLE9BQU8sQ0FBQyxJQUFJLEVB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