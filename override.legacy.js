// 原始覆写脚本来源：https://github.com/powerfullz/override-rules/blob/main/convert.js
// Mihomo 配置定义：https://raw.githubusercontent.com/dongchengjie/meta-json-schema/main/schemas/meta-json-schema.json
// Mihomo 官方配置：https://wiki.metacubex.one/example/conf/#__tabbed_2_1
// DNS 来源：https://www.aloxaf.com/2025/04/how_to_use_geosite/
// Ruleset 来源：https://github.com/DustinWin/ruleset_geodata

// #region Utils

function parseBool(value, defaultValue = false) {
    if (value === null || typeof value === "undefined") {
        return defaultValue;
    }
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        if (value.toLowerCase() === "true" || value === "1") {
            return true;
        }
        if (value.toLowerCase() === "false" || value === "0") {
            return false;
        }
    }
    throw new Error(`Invalid boolean value: ${value}`);
}

function parseNumber(value, defaultValue = 0) {
    if (value === null || typeof value === "undefined") {
        return defaultValue;
    }
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
}

function parseString(defaultValue) {
    return (value) => {
        if (value === null || typeof value === "undefined") {
            return defaultValue;
        }
        return String(value);
    };
}

function parseArgs(args) {
    const spec = {
        ipv6Enabled: parseBool,
        dnsMode: parseString("fake-ip"),
    };

    const flags = Object.entries(spec).reduce((acc, [name, parseFunc]) => {
        acc[name] = parseFunc(args[name]);
        return acc;
    }, {});

    return flags;
}

const rawArgs = typeof $arguments !== "undefined" ? $arguments : {};
const args = parseArgs(rawArgs);

function getGithub(owner, repo, branch, path) {
    // const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    const url = `https://fastly.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
    return url;
}
const miniIcon = (name) => getGithub("Orz-3", "mini", "master", `Color/${name}.png`);
const qureIcon = (name) => getGithub("Koolson", "Qure", "master", `IconSet/Color/${name}.png`);

// mergeList([1, 2], 3, [true && 4, false && 5]) => [1, 2, 3, 4]
function mergeList(...elements) {
    return elements.flat().filter(Boolean);
}

// mergeDict({a: 1, b: {c: 3}}, true && {d: {e: 5}}, false && {f: 6}) => {a: 1, b: {c: 3}, d: {e: 5}}
// mergeDict({a: 1, b: {c: 3}}, {b: {d: 4}}) => throw
function mergeDict(...elements) {
    const res = elements[0];
    for (let i = 1; i < elements.length; i++) {
        const curr = elements[i];
        if (!curr) continue;
        for (const key in curr) {
            if (key in res) {
                throw new Error(`Key conflict when merging dict: ${key}`);
            }
            res[key] = curr[key];
        }
    }
    return res;
}

// setDict(obj, "a.b.c", value) => obj.a.b.c = value
// setDict(obj, ["a", "b", "c"], value) => obj.a.b.c = value
function setDict(obj, key, value) {
    if (typeof key === "string") {
        key = key.split(".");
    }
    key.reduce((acc, curr, index) => {
        if (index === key.length - 1) {
            acc[curr] = value;
        } else {
            acc[curr] = acc[curr] || {};
        }
        return acc[curr];
    }, obj);
}

class Ruleset {
    #ruleProviders = {};
    #proxyGroups = {};

    addRuleset(owner, repo, branch, path, overrides = {}) {
        if (this.#ruleProviders.hasOwnProperty(path)) {
            return;
        }

        let name = path.match(/([\w\-_]+)\.(\w+)$/)[1]
        let behavior = name.endsWith("ip") ? "ipcidr" : "domain";
        let format;
        if (path.endsWith(".yaml")) {
            format = "yaml";
            behavior = "classical";
        } else if (path.endsWith(".mrs")) {
            format = "mrs";
        } else if (path.endsWith(".list")) {
            format = "text";
            behavior = "classical";
        } else {
            throw new Error(`Unsupported ruleset format for path: ${path}`);
        }

        this.#ruleProviders[name] = {
            type: "http",
            behavior,
            format,
            interval: 86400,
            path: `./ruleset/${owner}/${name}.${format}`,
            url: getGithub(owner, repo, branch, path),
            ...overrides,
        };

        return name;
    }

    addProxyGroup(name, config, customInfo = {}) {
        this.#proxyGroups[name] = { config, customInfo };
        return name;
    }

    getProxyGroup(name) {
        return this.#proxyGroups[name];
    }

    buildProxyGroups() {
        const result = [];
        for (const [name, { config }] of Object.entries(this.#proxyGroups)) {
            result.push(config);
        }
        return result;
    }

    buildRuleProviders() {
        return this.#ruleProviders;
    }
}

// #endregion

function customize(config) {
    const nameserverPriority = {
        "+.nju.edu.cn": "system",
    };
    if (!config["dns"]["nameserver-priority"]) {
        config["dns"]["nameserver-priority"] = {};
    }
    Object.assign(config["dns"]["nameserver-priority"], nameserverPriority);
}

// #region General

// 构建通用配置部分
// 通常而言使用的客户端会覆盖这些配置，此处仅用于启动裸核时使用的配置
function buildGeneralConfig({ ipv6Enabled }) {
    const inbound = {
        "mixed-port": 7890,
        "allow-lan": true,
        "bind-address": "*",
        // "authentication": ["user:8db22dfa-c425-42ca-8d1d-5e1a62e232ef"], // 启用认证，格式 "用户名:密码"
    };
    const externalControl = {
        "external-controller": "[::]:9093",
        secret: "8db22dfa-c425-42ca-8d1d-5e1a62e232ef",
    };
    const metacubexd = {
        "external-ui": "ui",
        "external-ui-name": "metacubexd",
        "external-ui-url":
            "https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip",
    };
    const yacd = {
        "external-ui": "ui",
        "external-ui-name": "yacd",
        "external-ui-url":
            "https://github.com/haishanh/yacd/archive/refs/heads/gh-pages.zip",
    };
    const core = {
        mode: "rule",
        ipv6: ipv6Enabled,

        "unified-delay": true, // 统一延迟测量，不记录与代理建立连接的用时，只统计代理建立链接完成后的一次完整请求的 RTT 延迟
        "tcp-concurrent": true, // TCP 并发连接，对同一域名解析出的多个 IP 同时发起连接，择优使用
        "find-process-mode": "strict", // 是否查找发起连接的进程并以此作为依据匹配分流规则，strict 为 clash 自行判断
        "global-client-fingerprint": "chrome", // 全局客户端指纹，用于伪装 TLS 流量

        profile: {
            "store-selected": true, // 记忆所选代理
            "store-fake-ip": true, // 记忆 Fake IP 映射
        },
    };
    const tun = {
        tun: {
            enable: true,
            stack: "mixed", // 可选: system, gvisor, mixed
        },
    };
    const geodata = {
        "geo-auto-update": true, // 是否自动更新 geodata
        "geo-update-interval": 24, // 更新间隔（小时），24 = 每天更新一次
        "geox-url": {
            geoip: getGithub(
                "DustinWin",
                "ruleset_geodata",
                "mihomo-geodata",
                "geoip.dat"
            ),
            geosite: getGithub(
                "DustinWin",
                "ruleset_geodata",
                "mihomo-geodata",
                "geosite.dat"
            ),
            mmdb: getGithub(
                "DustinWin",
                "ruleset_geodata",
                "mihomo-geodata",
                "Country.mmdb"
            ),
            asn: getGithub(
                "DustinWin",
                "ruleset_geodata",
                "mihomo-geodata",
                "GeoLite2-ASN.mmdb"
            ),
        },
    };
    // 根据连接握手时的信息（如 SNI、HTTP Host 等）进行域名嗅探
    // 一些软件在解析完域名后会直接使用 IP 进行连接，导致无法根据域名进行分流，此时启用嗅探可以推测出域名以便分流
    const sniffer = {
        sniffer: {
            enable: true,
            "override-destination": true, // 将连接的地址改写为嗅探的结果
            "force-dns-mapping": true, // 对 redir-host 类型识别的流量进行强制嗅探
            "parse-pure-ip": true, // 对所有未获取到域名的流量进行强制嗅探
            sniff: {
                HTTP: {
                    ports: [80, 8080, 8880],
                },
                TLS: {
                    ports: [443, 8443],
                },
                QUIC: {
                    ports: [443, 8443],
                },
            },
            // 强制对这些域名进行嗅探（即使已经有目标地址）
            "force-domain": [
                "+.netflix.com", // Netflix 主域名
                "+.nflxvideo.net", // Netflix CDN
                "+.amazonaws.com", // AWS 云服务
                "+.media.dssott.com", // Disney+ 流媒体
            ],
            // 跳过对这些域名的嗅探（避免干扰）
            "skip-domain": [
                "+.apple.com", // 苹果服务
                "Mijia Cloud", // 米家云服务
                "dlg.io.mi.com", // 小米设备通信
                "+.oray.com", // 花生壳服务
                "+.sunlogin.net", // 向日葵远程控制
                "+.push.apple.com", // 苹果推送服务
            ],
        },
    };

    return mergeDict(inbound, externalControl, yacd, core, tun, geodata, sniffer);
}

// #endregion

// #region DNS

function buildDnsConfig({ ipv6Enabled, dnsMode, ruleset }) {
    if (dnsMode !== "fake-ip" && dnsMode !== "redir-host") {
        throw new Error("Invalid dnsMode: " + dnsMode);
    }

    const dnsCore = {
        enable: true,
        ipv6: ipv6Enabled,
        "enhanced-mode": dnsMode,
        "prefer-h3": true, // 优先使用 DOH 的 HTTP/3 进行 DNS 查询

        "use-hosts": true, // 使用当前 Config 中 hosts 指定的域名映射
        "use-system-hosts": true, // 使用系统 hosts 文件中的域名映射
        "respect-rules": false, // 访问 DNS 服务器时同样根据分流规则决定是否通过代理访问，需要确保 proxy-server-nameserver 中的 DNS 服务器会被分流成直连
    };

    const fakeIp = {
        "fake-ip-filter-mode": "blacklist",
        "fake-ip-filter": [
            "rule-set:fakeip-filter",
            "rule-set:private",
            "rule-set:cn",
        ],
    };

    const hosts = {
        hosts: {
            "dns.alidns.com": [
                "223.5.5.5",
                "223.6.6.6",
                "2400:3200::1",
                "2400:3200:baba::1",
            ],
            "dns.pub": ["119.29.29.29", "1.12.12.12", "2402:4e00::"],
        },
    };

    const cnDns = [
        "system",
        "223.5.5.5",
        "223.6.6.6",
        "2400:3200::1",
        "2400:3200:baba::1",
        "https://doh.pub/dns-query",
        "https://dns.alidns.com/dns-query",
    ];
    const cnDoh = [
        "https://doh.pub/dns-query",
        "https://dns.alidns.com/dns-query",
    ];
    // EDNS Client Subnet 设置为国内 IP 段，避免因为使用代理解析 DNS 导致返回的 IP 为国外
    // 可以根据自己所在地在 http://ipcn.chacuo.net/ 查找合适的 ECS 段
    const trustedDns = [
        "https://cloudflare-dns.com/dns-query#proxy&ecs=120.76.0.0/14&ecs-override=true",
        "https://dns.google/dns-query#proxy&ecs=120.76.0.0/14&ecs-override=true",
    ];

    // 解析流程见 https://wiki.metacubex.one/config/dns/diagram/#_2
    const dnsServers = {
        // 用于解析其他 DNS 服务器域名的 DNS，必须为 IP
        "direct-nameserver": [
            "system",
            "223.5.5.5",
            "223.6.6.6",
            "2400:3200::1",
            "2400:3200:baba::1",
        ],

        // 用于解析代理节点域名，此时代理节点尚不可用，但无敏感信息
        "proxy-server-nameserver": cnDns,

        // 用于解析域名以判断 Geosite IP 分流规则
        nameserver: trustedDns,

        // 用于解析分流规则判定为直连的域名
        "direct-nameserver": cnDns,
    };

    return {
        ...hosts,
        dns: {
            ...dnsCore,
            ...(dnsMode === "fake-ip" ? fakeIp : {}),
            ...dnsServers,
        },
    };
}

// #endregion

// #region Ruleset

function buildRulesetConfig({ ruleset }) {
    const rule = (ruleProvider, proxy, ...options) => {
        options = options || [];
        optionStr = options.map((opt) => "," + opt).join("");
        return `RULE-SET,${ruleProvider},${proxy}${optionStr}`;
    };

    const dustinRule = (name) => {
        ruleset.addRuleset("DustinWin", "ruleset_geodata", "mihomo-ruleset", `${name}.mrs`);
        return name;
    };
    dustinRule("fakeip-filter");

    const select = (name, defaultProxy) => {
        const group = ruleset.getProxyGroup(name);
        if (group === undefined) {
            throw new Error(`Proxy group not found: ${name}`);
        }
        if (group.customInfo.defaultProxy !== defaultProxy) {
            throw new Error(
                `Default proxy mismatch for group ${name}: expected ${defaultProxy}, got ${group.customInfo.defaultProxy}`
            );
        }
        return name;
    };

    const rules = mergeList(
        `IP-CIDR,172.29.0.0/16,${select("校园网", "easyconnect")}`,
        `IP-CIDR,142.171.5.135/32,DIRECT`,
        `AND,((DOMAIN,github.com),(DST-PORT,22)),DIRECT`,

        rule(dustinRule("private"), select("私有网络", "DIRECT")),
        rule(dustinRule("ads"), select("广告", "REJECT")),

        rule(ruleset.addRuleset("nerdneilsfield", "clash_rules_for_scholar", "master", "rules/scholar.yaml"), select("学术网站", "DIRECT")),
        rule(dustinRule("trackerslist"), select("种子 Trackers", "手动选择")),

        rule(ruleset.addRuleset("DustinWin", "ruleset_geodata", "mihomo-ruleset", "applications.list"), select("国内直连", "DIRECT")),
        ["microsoft-cn", "apple-cn", "google-cn", "games-cn"].map(
            (name) => rule(dustinRule(name), select("国内直连", "DIRECT"))
        ),

        [
            "netflix",
            "disney",
            "max",
            "primevideo",
            "appletv",
            "youtube",
            "tiktok",
            // "bilibili",
            "spotify",
            "media",
            "games",
            "ai",
            "networktest",
            "tld-proxy",
        ].map((name) => rule(dustinRule(name), select("流媒体", "手动选择"))),

        rule(dustinRule("games"), select("游戏平台", "手动选择")),
        rule(dustinRule("ai"), "国外 AI"),

        rule(dustinRule("networktest"), select("国外代理", "手动选择")),
        rule(dustinRule("tld-proxy"), select("国外代理", "手动选择")),
        rule(dustinRule("proxy"), select("国外代理", "手动选择")),
        rule(dustinRule("cn"), select("国内直连", "DIRECT")),

        rule(dustinRule("privateip"), select("私有网络", "DIRECT"), "no-resolve"),
        rule(dustinRule("cnip"), select("国内直连", "DIRECT"), "no-resolve"),
        rule(dustinRule("netflixip"), select("流媒体", "手动选择"), "no-resolve"),
        rule(dustinRule("mediaip"), select("流媒体", "手动选择"), "no-resolve"),
        rule(dustinRule("gamesip"), select("游戏平台", "手动选择"), "no-resolve"),
        rule(
            dustinRule("telegramip"),
            select("国外代理", "手动选择"),
            "no-resolve"
        ),

        `MATCH,${select("漏网之鱼", "手动选择")}`
    );

    return { rules, "rule-providers": ruleset.buildRuleProviders() };
}

// #endregion

// #region Proxy Group

function buildProxyGroupConfig({ ruleset, proxies }) {
    const reorderProxies = (proxies, defaultProxy) => {
        const reorderedProxies = [...proxies];
        if (defaultProxy) {
            let index = reorderedProxies.indexOf(defaultProxy);
            if (index !== -1) {
                reorderedProxies.splice(index, 1);
            }
            reorderedProxies.unshift(defaultProxy);
        }
        return reorderedProxies;
    };

    const groupCommon = {
        type: "select",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        "max-failed-times": 2,
    };

    const generalGroup = (overrides = {}) => {
        const { name } = overrides;
        ruleset.addProxyGroup(name, {
            ...groupCommon,
            name,
            proxies: reorderProxies(proxies, overrides.defaultProxy),
            ...overrides,
        }, overrides);
        return name;
    };

    const primitiveGroups = [
        "DIRECT",
        "REJECT",
    ]

    const generalGroups = [
        generalGroup({
            name: "手动选择",
            proxies: ["延迟测试", "负载均衡", ...proxies, ...primitiveGroups],
            icon: miniIcon("Static"),
        }),
        generalGroup({
            name: "延迟测试",
            type: "url-test",
            icon: getGithub("Koolson", "Qure", "master", "IconSet/Color/Auto.png"),
        }),
        generalGroup({
            name: "负载均衡",
            type: "load-balance",
            strategy: "sticky-sessions",
            icon: getGithub("Koolson", "Qure", "master", "IconSet/Color/Round_Robin.png"),
        }),
    ];

    const groupAi = generalGroup({
        name: "国外 AI",
        type: "url-test",
        filter:
            "(?i)🇸🇬|新加坡|SG|Singapore|🇯🇵|日本|JP|Japan|🇰🇷|韩国|KR|Korea|🇺🇲|美国|US|America|United States",
        "exclude-filter":
            "(?i)香港|HK|Hong Kong|台湾|TW|Tai Wan|官网|TG|节点|到期|流量|返利|订阅",
        icon: "https://img.icons8.com/?size=100&id=Nts60kQIvGqe&format=png&color=000000",
    });

    const trafficGroup = (name, defaultProxy, icon) => {
        const iconUrl = icon.includes("http") ? icon : getGithub("Koolson", "Qure", "master", `IconSet/Color/${icon}.png`);
        ruleset.addProxyGroup(name, {
            ...groupCommon,
            icon: iconUrl,
            name,
            proxies: reorderProxies(generalGroups.concat(proxies).concat(primitiveGroups), defaultProxy),
        }, { defaultProxy });
        return name;
    };
    const trafficGroups = [
        trafficGroup("校园网", "easyconnect", "https://img.icons8.com/?size=100&id=4XCV6mm0hqu3&format=png&color=000000"),
        trafficGroup("漏网之鱼", "手动选择", "Final"),
        trafficGroup("学术网站", "DIRECT", "https://img.icons8.com/?size=100&id=114326&format=png&color=000000"),
        trafficGroup("游戏平台", "手动选择", miniIcon("Steam")),
        trafficGroup("流媒体", "手动选择", "Netflix"),
        trafficGroup("种子 Trackers", "手动选择", "https://img.icons8.com/?size=100&id=tdQvZGPZFFuW&format=png&color=000000"),
        trafficGroup("国外代理", "手动选择", "Global"),
        trafficGroup("国内直连", "DIRECT", miniIcon("China")),
        trafficGroup("私有网络", "DIRECT", "https://img.icons8.com/?size=100&id=123514&format=png&color=000000"),
        trafficGroup("广告", "REJECT", "https://img.icons8.com/?size=100&id=4XCV6mm0hqu3&format=png&color=000000"),
    ];

    const proxyGroupOrder = [...generalGroups, groupAi, ...trafficGroups];

    let proxyGroups = ruleset.buildProxyGroups();
    proxyGroups = proxyGroups.sort((a, b) => {
        const indexA = proxyGroupOrder.indexOf(a.name);
        const indexB = proxyGroupOrder.indexOf(b.name);
        return indexA - indexB;
    });

    return { 'proxy-groups': proxyGroups };
}

// #endregion

function main(config) {
    const proxies = config.proxies;
    // Add easyconnect proxy
    proxies.push({
        name: "easyconnect",
        type: "socks5",
        server: "127.0.0.1",
        port: 1080
    });
    const ruleset = new Ruleset();
    const buildArgs = {
        ...args,
        ruleset,
        proxies: proxies.map(p => p.name),
    };

    const resultConfig = mergeDict(
        buildGeneralConfig(buildArgs),
        buildDnsConfig(buildArgs),
        { proxies },
        buildProxyGroupConfig(buildArgs),
        buildRulesetConfig(buildArgs)
    );

    customize(resultConfig);

    return resultConfig;
}

// console.log(main({
//     proxies: [1, 2, 3],
// }))
