// modules/ssh.js — SSH（端口 22）代理模块
//
// SSH 连接有时需要通过代理（如访问 GitHub SSH），有时需要直连（如内网设备）。
// 提供一个 select 组让用户手动选择 SSH 流量的处理方式：
//   - DIRECT：直连（默认）
//   - 手动选择：通过代理
//   - 其他代理组

const { deferred } = require('../lib/lazy');
const {
    GROUP_COMMON, PRIMITIVE_GROUPS, reorderProxies,
    externalIcon,
} = require('../lib/helpers');

module.exports = function sshModule(final, prev, ctx) {
    return {
        proxyGroups: [
            {
                ...GROUP_COMMON,
                name: "SSH 代理",
                type: "select",
                proxies: deferred(() =>
                    reorderProxies(final._allSelectables, "DIRECT")
                ),
                icon: externalIcon("fSPmETYJKmmk"),
            },
        ],

        // DST-PORT,22 匹配所有 SSH 流量
        rules: [
            "DST-PORT,22,SSH 代理",
        ],
    };
};
