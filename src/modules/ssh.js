// src/modules/ssh.js — SSH（端口 22）代理模块

import { deferred, mkOrder } from '../lib/lazy.js';
import { GROUP_COMMON, reorderProxies, externalIcon } from '../lib/helpers.js';

export default function sshModule(final, prev, ctx) {
    return {
        'proxy-groups': mkOrder(15, [
            {
                ...GROUP_COMMON,
                name: "SSH 代理",
                type: "select",
                proxies: deferred(() =>
                    reorderProxies(final._allSelectables, "DIRECT")
                ),
                icon: externalIcon("fSPmETYJKmmk"),
            },
        ]),

        rules: mkOrder(15, [
            "DST-PORT,22,SSH 代理",
        ]),
    };
}
