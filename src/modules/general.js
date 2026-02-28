// src/modules/general.js — 通用配置：入站、控制器、TUN、Geodata、嗅探

import { getGithub } from '../lib/clash.js';

export default function generalModule(final, prev, ctx) {
    const { ipv6Enabled } = ctx.args;

    return {
        "mixed-port": 7890,
        "allow-lan": true,
        "bind-address": "*",

        "external-controller": "[::]:9093",
        secret: "8db22dfa-c425-42ca-8d1d-5e1a62e232ef",

        "external-ui": "ui",
        "external-ui-name": "yacd",
        "external-ui-url":
            "https://github.com/haishanh/yacd/archive/refs/heads/gh-pages.zip",

        mode: "rule",
        ipv6: ipv6Enabled,
        "unified-delay": true,
        "tcp-concurrent": true,
        "find-process-mode": "strict",
        "global-client-fingerprint": "chrome",
        profile: { "store-selected": true, "store-fake-ip": true },

        "geo-auto-update": true,
        "geo-update-interval": 24,
        "geox-url": {
            geoip:   getGithub("DustinWin", "ruleset_geodata", "mihomo-geodata", "geoip.dat"),
            geosite: getGithub("DustinWin", "ruleset_geodata", "mihomo-geodata", "geosite.dat"),
            mmdb:    getGithub("DustinWin", "ruleset_geodata", "mihomo-geodata", "Country.mmdb"),
            asn:     getGithub("DustinWin", "ruleset_geodata", "mihomo-geodata", "GeoLite2-ASN.mmdb"),
        },

        tun: { enable: true, stack: "mixed" },

        sniffer: {
            enable: true,
            "override-destination": true,
            "force-dns-mapping": true,
            "parse-pure-ip": true,
            sniff: {
                HTTP:  { ports: [80, 8080, 8880] },
                TLS:   { ports: [443, 8443] },
                QUIC:  { ports: [443, 8443] },
            },
            "force-domain": [
                "+.netflix.com", "+.nflxvideo.net",
                "+.amazonaws.com", "+.media.dssott.com",
            ],
            "skip-domain": [
                "+.apple.com", "Mijia Cloud", "dlg.io.mi.com",
                "+.oray.com", "+.sunlogin.net", "+.push.apple.com",
            ],
        },
    };
}
