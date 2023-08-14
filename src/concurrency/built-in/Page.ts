
import * as puppeteer from 'puppeteer';

import { ResourceData } from '../ConcurrencyImplementation';
import SingleBrowserImplementation from '../SingleBrowserImplementation';

export default class Page extends SingleBrowserImplementation {

    protected async createResources(): Promise<ResourceData> {
        if (this.options.CreateInstanceFunc) {
            return {
                page: await this.options.CreateInstanceFunc(this.browser as puppeteer.Browser, this.options.session)
            }
        }else {
            return {
                page: await (this.browser as puppeteer.Browser).newPage(),
            };
        }
    }

    protected async freeResources(resources: ResourceData): Promise<void> {
        await resources.page.close();
    }

}
