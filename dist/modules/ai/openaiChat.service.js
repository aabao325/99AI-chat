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
exports.OpenAIChatService = void 0;
const utils_1 = require("../../common/utils");
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
let OpenAIChatService = class OpenAIChatService {
    constructor(globalConfigService) {
        this.globalConfigService = globalConfigService;
    }
    async openAIChat(messagesHistory, inputs, agentMessages) {
        var _a;
        const { onFailure, onProgress, apiKey, model, proxyUrl, modelName, timeout, chatId, isFileUpload, modelAvatar, temperature, abortController, prompt, usingDeepThinking, deepThinkingModel, deepThinkingUrl, deepThinkingKey, } = inputs;
        let result = {
            text: '',
            answer: '',
            canvasText: '',
            canvasContent: '',
            model: '',
            modelName: modelName,
            chatId: chatId,
            errMsg: '',
            modelAvatar: modelAvatar,
        };
        try {
            if (agentMessages && agentMessages.length > 0) {
                const firstStreamData = {
                    model,
                    messages: agentMessages,
                    stream: true,
                    temperature,
                };
                const firstStreamOptions = {
                    method: 'POST',
                    url: `${proxyUrl}/v1/chat/completions`,
                    responseType: 'stream',
                    timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${apiKey}`,
                    },
                    data: firstStreamData,
                };
                common_1.Logger.log('First Stream Request:', JSON.stringify(firstStreamOptions, null, 2));
                const firstResponse = await (0, axios_1.default)(firstStreamOptions);
                const firstStream = firstResponse.data;
                let buffer = '';
                await new Promise((resolve, reject) => {
                    firstStream.on('data', (chunk) => {
                        buffer += chunk.toString();
                        let lines = buffer.split('\n');
                        buffer = lines.pop() || '';
                        lines.forEach((line) => {
                            var _a, _b, _c;
                            if (line.trim() === 'data: [DONE]') {
                                resolve(result);
                                return;
                            }
                            if (line.startsWith('data: ')) {
                                try {
                                    const cleanedLine = line.slice(6).trim();
                                    if (cleanedLine) {
                                        const jsonLine = JSON.parse(cleanedLine);
                                        const content = ((_c = (_b = (_a = jsonLine.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.delta) === null || _c === void 0 ? void 0 : _c.content) || '';
                                        result.canvasText = content;
                                        result.canvasContent += content;
                                        onProgress === null || onProgress === void 0 ? void 0 : onProgress({
                                            text: result.text,
                                            answer: result.answer,
                                            canvasText: result.canvasText,
                                            content: result.content,
                                        });
                                    }
                                }
                                catch (error) {
                                    common_1.Logger.error('解析第一个流失败:', line, error);
                                }
                            }
                        });
                    });
                    firstStream.on('end', () => resolve(result));
                    firstStream.on('error', reject);
                    abortController.signal.addEventListener('abort', () => resolve(result));
                });
            }
            let thinkContent = '';
            let isThinkStreamResolved = false;
            if (usingDeepThinking ||
                model.includes('deepseek-r1') ||
                model.includes('deepseek-reasoner')) {
                const deepUrl = model.includes('deepseek-r1') || model.includes('deepseek-reasoner')
                    ? proxyUrl
                    : deepThinkingUrl;
                const deepKey = model.includes('deepseek-r1') || model.includes('deepseek-reasoner')
                    ? apiKey
                    : deepThinkingKey;
                const deepModel = model.includes('deepseek-r1') || model.includes('deepseek-reasoner')
                    ? model
                    : deepThinkingModel;
                const thinkStreamData = {
                    model: deepModel,
                    messages: [...messagesHistory],
                    stream: true,
                };
                const thinkStreamOptions = {
                    method: 'POST',
                    url: `${deepUrl}/v1/chat/completions`,
                    responseType: 'stream',
                    timeout: timeout * 5,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${deepKey}`,
                    },
                    data: thinkStreamData,
                };
                const options = await this.sanitizeOptionsForLogging(thinkStreamOptions);
                common_1.Logger.log(`思考流参数：${JSON.stringify(options, null, 2)}`, 'AIChat');
                const thinkResponse = await (0, axios_1.default)(thinkStreamOptions);
                const thinkStream = thinkResponse.data;
                let buffer = '';
                let isUsingReasoningContent = false;
                await new Promise((resolve, reject) => {
                    thinkStream.on('data', (chunk) => {
                        if (isThinkStreamResolved)
                            return;
                        buffer += chunk.toString();
                        let lines = buffer.split('\n');
                        buffer = lines.pop() || '';
                        lines.forEach((line) => {
                            var _a, _b;
                            if (line.trim() === 'data: [DONE]') {
                                isThinkStreamResolved = true;
                                resolve(result);
                                return;
                            }
                            if (line.startsWith('data: ')) {
                                try {
                                    const cleanedLine = line.slice(6).trim();
                                    if (cleanedLine) {
                                        const jsonLine = JSON.parse(cleanedLine);
                                        const delta = (_b = (_a = jsonLine.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.delta;
                                        let thinkFlowContent = '';
                                        if ((delta === null || delta === void 0 ? void 0 : delta.reasoning_content) && !isUsingReasoningContent) {
                                            isUsingReasoningContent = true;
                                            thinkFlowContent = '<think>' + delta.reasoning_content;
                                        }
                                        else if (isUsingReasoningContent) {
                                            if (delta.reasoning_content) {
                                                thinkFlowContent = delta.reasoning_content;
                                            }
                                            else {
                                                thinkFlowContent = '</think>';
                                            }
                                        }
                                        else {
                                            thinkFlowContent = (delta === null || delta === void 0 ? void 0 : delta.content) || '';
                                        }
                                        if (thinkFlowContent) {
                                            result.text = thinkFlowContent;
                                            result.answer += thinkFlowContent;
                                            thinkContent = result.answer;
                                            onProgress === null || onProgress === void 0 ? void 0 : onProgress({
                                                text: result.text,
                                                answer: result.answer,
                                                canvasText: result.canvasText,
                                                content: result.content,
                                            });
                                        }
                                        if (result.answer.includes('</think>')) {
                                            if (model.includes('deepseek-r1') ||
                                                model.includes('deepseek-reasoner')) {
                                                isUsingReasoningContent = false;
                                            }
                                            else {
                                                isThinkStreamResolved = true;
                                                resolve(result);
                                                return;
                                            }
                                        }
                                    }
                                }
                                catch (error) {
                                    common_1.Logger.error('解析思考流失败:', line, error);
                                }
                            }
                        });
                    });
                    thinkStream.on('end', () => {
                        if (!isThinkStreamResolved) {
                            isThinkStreamResolved = true;
                            console.log('思考流已完成:', result.answer);
                            resolve(result);
                        }
                    });
                    thinkStream.on('error', reject);
                    abortController.signal.addEventListener('abort', () => {
                        if (!isThinkStreamResolved) {
                            isThinkStreamResolved = true;
                            resolve(result);
                        }
                    });
                });
            }
            if (model.includes('deepseek-r1') ||
                model.includes('deepseek-reasoner')) {
                result.text = '';
                return result;
            }
            const secondStreamData = {
                model,
                messages: [...messagesHistory],
                stream: true,
                temperature,
            };
            const systemMessage = (_a = secondStreamData.messages) === null || _a === void 0 ? void 0 : _a.find((message) => message.role === 'system');
            if (systemMessage) {
                systemMessage.content += `\n以下是针对这个问题的思考推理思路，请参考回答：\n${thinkContent}`;
            }
            else {
                secondStreamData.messages.unshift({
                    role: 'system',
                    content: `\n以下是针对这个问题的思考推理思路，请参考回答：\n${thinkContent}`,
                });
            }
            const secondStreamOptions = {
                method: 'POST',
                url: `${proxyUrl}/v1/chat/completions`,
                responseType: 'stream',
                timeout,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                data: secondStreamData,
            };
            const options = await this.sanitizeOptionsForLogging(secondStreamOptions);
            common_1.Logger.log(`普通对话参数：${JSON.stringify(options, null, 2)}`, 'AIChat');
            const secondResponse = await (0, axios_1.default)(secondStreamOptions);
            const secondStream = secondResponse.data;
            let buffer = '';
            await new Promise((resolve, reject) => {
                console.log('secondStream');
                secondStream.on('data', (chunk) => {
                    buffer += chunk.toString();
                    let lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    lines.forEach((line) => {
                        var _a, _b, _c;
                        if (line.trim() === 'data: [DONE]') {
                            resolve(result);
                            return;
                        }
                        if (line.startsWith('data: ')) {
                            try {
                                const cleanedLine = line.slice(6).trim();
                                if (cleanedLine) {
                                    const jsonLine = JSON.parse(cleanedLine);
                                    const content = ((_c = (_b = (_a = jsonLine.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.delta) === null || _c === void 0 ? void 0 : _c.content) || '';
                                    result.text = content;
                                    result.answer += content;
                                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({
                                        text: result.text,
                                        answer: result.answer,
                                        canvasText: result.canvasText,
                                        content: result.content,
                                    });
                                }
                            }
                            catch (error) {
                                common_1.Logger.error('解析第二个流失败:', line, error);
                            }
                        }
                    });
                });
                secondStream.on('end', () => resolve(result));
                secondStream.on('error', reject);
                abortController.signal.addEventListener('abort', () => resolve(result));
            });
            return result;
        }
        catch (error) {
            result.errMsg = (0, utils_1.handleError)(error);
            common_1.Logger.error(result.errMsg);
            onFailure === null || onFailure === void 0 ? void 0 : onFailure(result);
            return result;
        }
    }
    async sanitizeOptionsForLogging(options) {
        const sanitizedOptions = JSON.parse(JSON.stringify(options));
        if (sanitizedOptions.headers && sanitizedOptions.headers.Authorization) {
            const authHeader = sanitizedOptions.headers.Authorization;
            if (authHeader.startsWith('Bearer ')) {
                const token = authHeader.slice(7);
                if (token.length > 10) {
                    sanitizedOptions.headers.Authorization = `Bearer ${token.slice(0, 5)}****${token.slice(-4)}`;
                }
            }
        }
        if (sanitizedOptions.data &&
            sanitizedOptions.data.messages &&
            Array.isArray(sanitizedOptions.data.messages)) {
            sanitizedOptions.data.messages = sanitizedOptions.data.messages.map((message) => {
                if (message.content && Array.isArray(message.content)) {
                    message.content = message.content.map((content) => {
                        if (content.type === 'image_url' &&
                            content.image_url &&
                            content.image_url.url) {
                            content.image_url.url = 'data:image/***;base64 ... ...';
                        }
                        return content;
                    });
                }
                return message;
            });
        }
        return sanitizedOptions;
    }
    async chatFree(prompt, systemMessage, messagesHistory) {
        const { openaiBaseUrl = '', openaiBaseKey = '', openaiBaseModel, } = await this.globalConfigService.getConfigs([
            'openaiBaseKey',
            'openaiBaseUrl',
            'openaiBaseModel',
        ]);
        const key = openaiBaseKey;
        const proxyUrl = openaiBaseUrl;
        let requestData = [];
        if (systemMessage) {
            requestData.push({
                role: 'system',
                content: systemMessage,
            });
        }
        if (messagesHistory && messagesHistory.length > 0) {
            requestData = requestData.concat(messagesHistory);
        }
        else {
            requestData.push({
                role: 'user',
                content: prompt,
            });
        }
        const options = {
            method: 'POST',
            url: `${proxyUrl}/v1/chat/completions`,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            data: {
                model: openaiBaseModel || 'gpt-3.5-turbo-0125',
                messages: requestData,
            },
        };
        try {
            const response = await (0, axios_1.default)(options);
            common_1.Logger.log(`全局模型调用成功, 返回结果: ${response === null || response === void 0 ? void 0 : response.data.choices[0].message.content}`, 'ChatService');
            return response === null || response === void 0 ? void 0 : response.data.choices[0].message.content;
        }
        catch (error) {
            common_1.Logger.error('error: ', error);
        }
    }
};
OpenAIChatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [globalConfig_service_1.GlobalConfigService])
], OpenAIChatService);
exports.OpenAIChatService = OpenAIChatService;
