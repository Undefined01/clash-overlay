// test-integration.js — 对比新旧覆写脚本输出

const main = require('./override-new');

// 模拟代理节点
const mockConfig = {
    proxies: [
        { name: "🇭🇰 香港 HK-01", type: "vmess", server: "hk.example.com", port: 443 },
        { name: "🇸🇬 新加坡 SG-01", type: "vmess", server: "sg.example.com", port: 443 },
        { name: "🇯🇵 日本 JP-01", type: "vmess", server: "jp.example.com", port: 443 },
        { name: "🇺🇲 美国 US-01", type: "vmess", server: "us.example.com", port: 443 },
    ],
};

try {
    const result = main(mockConfig);

    console.log("=== Integration Test ===\n");

    // 1. Check top-level keys
    const requiredKeys = [
        "mixed-port", "allow-lan", "mode", "dns", "tun", "sniffer",
        "proxies", "proxy-groups", "rules", "rule-providers",
    ];
    const missingKeys = requiredKeys.filter(k => !(k in result));
    console.log(`Top-level keys: ${missingKeys.length === 0 ? "✓ OK" : "✗ MISSING: " + missingKeys.join(", ")}`);

    // 2. Proxy groups
    const groupNames = result["proxy-groups"].map(g => g.name);
    console.log(`\nProxy groups (${groupNames.length}): ${groupNames.join(", ")}`);

    const expectedGroups = [
        "手动选择", "延迟测试", "负载均衡", "国外 AI",
        "校园网", "私有网络", "广告", "学术网站", "种子 Trackers",
        "国内直连", "流媒体", "游戏平台", "国外代理", "漏网之鱼",
    ];
    const missingGroups = expectedGroups.filter(g => !groupNames.includes(g));
    console.log(`Expected groups: ${missingGroups.length === 0 ? "✓ All present" : "✗ MISSING: " + missingGroups.join(", ")}`);

    // 3. Rules
    console.log(`\nRules (${result.rules.length}):`);
    result.rules.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));

    // 4. Check rule ordering: domain rules before IP rules before MATCH
    const matchIdx = result.rules.findIndex(r => r.startsWith("MATCH"));
    const lastDomainIdx = result.rules.reduce((acc, r, i) =>
        r.startsWith("RULE-SET") && !r.includes("no-resolve") ? i : acc, -1);
    const firstIpIdx = result.rules.findIndex(r => r.includes("no-resolve"));
    console.log(`\nRule ordering: domain(last=${lastDomainIdx}) < ip(first=${firstIpIdx}) < MATCH(${matchIdx}): ${
        lastDomainIdx < firstIpIdx && firstIpIdx < matchIdx ? "✓ OK" : "✗ WRONG"
    }`);

    // 5. Rule providers
    const providerNames = Object.keys(result["rule-providers"]);
    console.log(`\nRule providers (${providerNames.length}): ${providerNames.join(", ")}`);

    // 6. Check a traffic group's proxies are resolved (not deferred)
    const streamGroup = result["proxy-groups"].find(g => g.name === "流媒体");
    const proxiesResolved = Array.isArray(streamGroup.proxies) && streamGroup.proxies.length > 0;
    console.log(`\n流媒体 proxies resolved: ${proxiesResolved ? "✓ " + streamGroup.proxies.join(", ") : "✗ UNRESOLVED"}`);

    // 7. Check easyconnect proxy exists
    const hasEasyconnect = result.proxies.some(p => p.name === "easyconnect");
    console.log(`easyconnect proxy: ${hasEasyconnect ? "✓ present" : "✗ MISSING"}`);

    // 8. DNS
    console.log(`\nDNS enhanced-mode: ${result.dns["enhanced-mode"]}`);
    console.log(`DNS nameserver-priority: ${JSON.stringify(result.dns["nameserver-priority"])}`);

    // 9. Check no duplicates in rules
    const ruleSet = new Set(result.rules);
    console.log(`\nDuplicate rules: ${ruleSet.size === result.rules.length ? "✓ None" : `✗ ${result.rules.length - ruleSet.size} duplicates`}`);

    console.log("\n=== PASS ===");
} catch (err) {
    console.error("=== FAIL ===");
    console.error(err.stack || err);
    process.exit(1);
}
