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
        var _a, _b;
        const { onFailure, onProgress, apiKey, model, proxyUrl, modelName, timeout, chatId, isFileUpload, modelAvatar, temperature, abortController, prompt, usingDeepThinking, deepThinkingModel, deepThinkingUrl, deepThinkingKey, sanitizedSearchResult, fileInfo, } = inputs;
        const originalMessagesHistory = JSON.parse(JSON.stringify(messagesHistory));
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
            networkSearchResult: '',
        };
        result.networkSearchResult = sanitizedSearchResult;
        try {
            const isDeepSeekModel = model.includes('deepseek-r1') || model.includes('deepseek-reasoner');
            let thinkContent = '';
            if (usingDeepThinking || isDeepSeekModel) {
                const deepUrl = isDeepSeekModel ? proxyUrl : deepThinkingUrl;
                const deepKey = isDeepSeekModel ? apiKey : deepThinkingKey;
                const deepModel = isDeepSeekModel ? model : deepThinkingModel;
                let isThinkStreamResolved = false;
                const processedMessagesHistory = await this.processMessagesHistory(messagesHistory);
                const thinkStreamData = {
                    model: deepModel,
                    messages: processedMessagesHistory,
                    stream: true,
                };
                let finalUrl = deepUrl.includes('https://api.deepseek.com')
                    ? `${deepUrl}/chat/completions`
                    : `${deepUrl}/v1/chat/completions`;
                const thinkStreamOptions = {
                    method: 'POST',
                    url: finalUrl,
                    responseType: 'stream',
                    timeout: timeout * 5,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${deepKey}`,
                    },
                    data: thinkStreamData,
                };
                const options = await this.sanitizeOptionsForLogging(thinkStreamOptions);
                common_1.Logger.debug(`思考流参数：${JSON.stringify(options, null, 2)}`, 'AIChat');
                const thinkResponse = await (0, axios_1.default)(thinkStreamOptions);
                const thinkStream = thinkResponse.data;
                let buffer = '';
                let isUsingReasoningContent = false;
                const resolveStream = (resolve) => {
                    if (!isThinkStreamResolved) {
                        common_1.Logger.log('思考流已完成', 'AIChat');
                        isThinkStreamResolved = true;
                        resolve(result);
                    }
                };
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
                                resolveStream(resolve);
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
                                                networkSearchResult: sanitizedSearchResult,
                                                text: result.text,
                                                answer: result.answer,
                                                canvasText: result.canvasText,
                                                content: result.content,
                                            });
                                        }
                                        if (result.answer.includes('</think>')) {
                                            if (isDeepSeekModel) {
                                                isUsingReasoningContent = false;
                                            }
                                            else {
                                                resolveStream(resolve);
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
                            resolve(result);
                        }
                    });
                    thinkStream.on('error', reject);
                    abortController.signal.addEventListener('abort', () => {
                        resolveStream(resolve);
                    });
                });
            }
            if (isDeepSeekModel) {
                result.text = '';
                return result;
            }
            common_1.Logger.debug('原始 messagesHistory:', JSON.stringify(originalMessagesHistory, null, 2));
            const secondStreamData = {
                model,
                messages: originalMessagesHistory,
                stream: true,
                temperature,
            };
            const systemMessage = (_a = secondStreamData.messages) === null || _a === void 0 ? void 0 : _a.find((message) => message.role === 'system');
            if (systemMessage) {
                const imageUrlMessages = ((_b = secondStreamData.messages) === null || _b === void 0 ? void 0 : _b.filter((message) => message.type === 'image_url')) || [];
                let updatedContent = `\n以下是针对这个问题的思考推理思路，请参考回答：\n${thinkContent}`;
                imageUrlMessages.forEach((imageMessage) => {
                    updatedContent = `${updatedContent}\n${JSON.stringify(imageMessage)}`;
                });
                systemMessage.content += updatedContent;
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
            common_1.Logger.debug(`普通对话参数：${JSON.stringify(options, null, 2)}`, 'AIChat');
            const secondResponse = await (0, axios_1.default)(secondStreamOptions);
            const secondStream = secondResponse.data;
            let buffer = '';
            await new Promise((resolve, reject) => {
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
                                        networkSearchResult: sanitizedSearchResult,
                                        text: result.text,
                                        answer: result.answer,
                                        canvasText: result.canvasText,
                                        content: result.content,
                                    });
                                }
                            }
                            catch (error) {
                                common_1.Logger.error('解析回答失败:', line, error);
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
    async processMessagesHistory(messagesHistory) {
        const processedMessages = await Promise.all(messagesHistory.map(async (message, index, array) => {
            if (message.role === 'user' && Array.isArray(message.content)) {
                if (index === array.length - 1) {
                    for (const item of message.content) {
                        if (item.type === 'image_url') {
                            const imageDescription = await this.chatFree('', '详细描述下图片中的内容', null, item.image_url.url);
                            const systemMessageIndex = array.findIndex((msg) => msg.role === 'system');
                            if (systemMessageIndex !== -1) {
                                array[systemMessageIndex].content += `\n\n图片描述: ${imageDescription}`;
                            }
                            else {
                                array.unshift({
                                    role: 'system',
                                    content: `图片描述: ${imageDescription}`,
                                });
                            }
                            message.content = `图片内容是：${imageDescription}`;
                            break;
                        }
                    }
                }
                else {
                    message.content = message.content
                        .filter((item) => item.type !== 'image_url')
                        .map((item) => item.text || item)
                        .join('');
                }
            }
            return message;
        }));
        return processedMessages.filter((message) => message !== null);
    }
    async chatFree(prompt, systemMessage, messagesHistory, fileInfo) {
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
            if (fileInfo) {
                requestData.push({
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: prompt,
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: fileInfo,
                            },
                        },
                    ],
                });
            }
            else {
                requestData.push({
                    role: 'user',
                    content: prompt,
                });
            }
        }
        const options = {
            method: 'POST',
            url: `${proxyUrl}/v1/chat/completions`,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            data: {
                model: openaiBaseModel || 'gpt-4o-mini',
                messages: requestData,
            },
        };
        try {
            const response = await (0, axios_1.default)(options);
            common_1.Logger.debug(`全局模型调用成功, 返回结果: ${response === null || response === void 0 ? void 0 : response.data.choices[0].message.content}`, 'ChatService');
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
