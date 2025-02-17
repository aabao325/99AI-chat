"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BigModelService = void 0;
const common_1 = require("@nestjs/common");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
let BigModelService = class BigModelService {
    constructor(globalConfigService) {
        this.globalConfigService = globalConfigService;
    }
    async webSearchPro(prompt) {
        const { pluginUrl, pluginKey } = await this.globalConfigService.getConfigs([
            'pluginUrl',
            'pluginKey',
        ]);
        const postData = {
            tool: 'web-search-pro',
            stream: false,
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        };
        const response = await fetch(pluginUrl, {
            method: 'POST',
            headers: {
                Authorization: pluginKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(postData),
        });
        const apiResult = await response.json();
        console.log(`联网搜索原始返回结果: ${JSON.stringify(apiResult)}`);
        let searchResultArray = [];
        if (apiResult &&
            apiResult.choices &&
            apiResult.choices[0] &&
            apiResult.choices[0].message &&
            apiResult.choices[0].message.tool_calls &&
            Array.isArray(apiResult.choices[0].message.tool_calls)) {
            for (const toolCall of apiResult.choices[0].message.tool_calls) {
                if (toolCall.search_result && Array.isArray(toolCall.search_result)) {
                    searchResultArray = toolCall.search_result;
                    break;
                }
            }
        }
        const formattedResult = searchResultArray.map((item, index) => ({
            resultIndex: index + 1,
            title: item.title,
            link: item.link,
            content: item.content,
            icon: item.icon,
            media: item.media,
        }));
        if (formattedResult.length === 0) {
            return { message: '未获取到搜索结果' };
        }
        return { searchResults: formattedResult };
    }
};
BigModelService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [globalConfig_service_1.GlobalConfigService])
], BigModelService);
exports.BigModelService = BigModelService;
