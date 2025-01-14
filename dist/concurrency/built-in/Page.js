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
const SingleBrowserImplementation_1 = require("../SingleBrowserImplementation");
class Page extends SingleBrowserImplementation_1.default {
    createResources() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.options.CreateInstanceFunc) {
                return {
                    page: yield this.options.CreateInstanceFunc(this.browser, this.options.session)
                };
            }
            else {
                return {
                    page: yield this.browser.newPage(),
                };
            }
        });
    }
    freeResources(resources) {
        return __awaiter(this, void 0, void 0, function* () {
            yield resources.page.close();
        });
    }
}
exports.default = Page;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUGFnZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9jb25jdXJyZW5jeS9idWlsdC1pbi9QYWdlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBSUEsZ0ZBQXlFO0FBRXpFLE1BQXFCLElBQUssU0FBUSxxQ0FBMkI7SUFFekMsZUFBZTs7WUFDM0IsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLGtCQUFrQixFQUFFO2dCQUNqQyxPQUFPO29CQUNILElBQUksRUFBRSxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLE9BQTRCLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUM7aUJBQ3ZHLENBQUE7YUFDSjtpQkFBSztnQkFDRixPQUFPO29CQUNILElBQUksRUFBRSxNQUFPLElBQUksQ0FBQyxPQUE2QixDQUFDLE9BQU8sRUFBRTtpQkFDNUQsQ0FBQzthQUNMO1FBQ0wsQ0FBQztLQUFBO0lBRWUsYUFBYSxDQUFDLFNBQXVCOztZQUNqRCxNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDakMsQ0FBQztLQUFBO0NBRUo7QUFsQkQsdUJBa0JDIn0=