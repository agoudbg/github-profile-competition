import { describe, expect, it } from "vitest";
import { parseLlmAnalysis } from "@/lib/llm";

describe("parseLlmAnalysis", () => {
  it("parses strict JSON analysis", () => {
    const analysis = parseLlmAnalysis(
      JSON.stringify({
        summary: "alpha 更强。",
        winner: {
          username: "alpha",
          reason: "综合分更高。",
          confidence: "high"
        },
        accountScores: [
          {
            username: "alpha",
            score: 88,
            reason: "模型认为 alpha 更强。"
          },
          {
            username: "beta",
            score: 71,
            reason: "模型认为 beta 略弱。"
          }
        ],
        dimensionInsights: [
          {
            dimension: "followers",
            title: "追随者",
            accounts: [
              {
                username: "alpha",
                insight: "alpha 更有影响力。"
              },
              {
                username: "beta",
                insight: "beta 社交触达较弱。"
              }
            ],
            verdict: "alpha 胜出。"
          }
        ],
        accountAnalyses: [
          {
            username: "alpha",
            strengths: ["代表项目强。"],
            risks: ["近期贡献需要持续。"],
            recommendations: ["继续维护代表项目。"]
          }
        ],
        caveats: ["公开数据有限。"],
        sources: [
          {
            id: "profile-alpha",
            label: "alpha profile",
            url: "https://github.com/alpha",
            note: "Profile source."
          }
        ]
      })
      ,
      ["alpha", "beta"]
    );

    expect(analysis.winner?.username).toBe("alpha");
    expect(analysis.dimensionInsights[0]?.dimension).toBe("followers");
  });

  it("extracts JSON from provider text", () => {
    const analysis = parseLlmAnalysis(`Result:\n${JSON.stringify({
      summary: "双方接近。",
      winner: null,
      accountScores: [
        {
          username: "alpha",
          score: 75,
          reason: "alpha 表达清楚。"
        },
        {
          username: "beta",
          score: 75,
          reason: "beta 社区基础好。"
        }
      ],
      dimensionInsights: [],
      accountAnalyses: [
        {
          username: "alpha",
          strengths: ["项目表达清楚。"],
          risks: [],
          recommendations: ["完善 README。"]
        },
        {
          username: "beta",
          strengths: ["社区基础好。"],
          risks: [],
          recommendations: ["补充代表项目。"]
        }
      ],
      caveats: [],
      sources: [
        {
          id: "profile-alpha",
          label: "alpha profile",
          url: "https://github.com/alpha",
          note: "Profile source."
        }
      ]
    })}`, ["alpha", "beta"]);

    expect(analysis.summary).toBe("双方接近。");
  });

  it("normalizes common provider shape drift", () => {
    const analysis = parseLlmAnalysis(
      JSON.stringify({
        summary: "alpha 更强。",
        winner: "alpha 综合领先",
        accountScores: {
          alpha: {
            score: "84",
            reason: "alpha 综合信号更强。"
          },
          beta: {
            score: 70,
            reason: "beta 仍有稳定基础。"
          }
        },
        dimensionInsights: [
          {
            dimension: "追随者",
            title: "追随者",
            accounts: {
              alpha: "alpha 触达更广。",
              beta: "beta 仍有稳定受众。"
            },
            verdict: "alpha 更有优势。"
          }
        ],
        accountAnalyses: {
          alpha: {
            strengths: "代表项目强",
            risks: "近期贡献需要持续",
            recommendations: "继续维护代表项目；补充 README"
          },
          beta: {
            strengths: "表达清楚",
            risks: "项目影响力较弱",
            recommendations: "突出代表作"
          }
        },
        caveats: "公开数据有限。",
        sources: [
          {
            id: "profile-alpha",
            label: "alpha profile",
            url: "https://github.com/alpha",
            note: "Profile source."
          }
        ]
      }),
      ["alpha", "beta"]
    );

    expect(analysis.winner?.username).toBe("alpha");
    expect(analysis.accountScores).toEqual([
      {
        username: "alpha",
        score: 84,
        reason: "alpha 综合信号更强。"
      },
      {
        username: "beta",
        score: 70,
        reason: "beta 仍有稳定基础。"
      }
    ]);
    expect(analysis.dimensionInsights[0]).toMatchObject({
      dimension: "followers",
      accounts: [
        {
          username: "alpha",
          insight: "alpha 触达更广。"
        },
        {
          username: "beta",
          insight: "beta 仍有稳定受众。"
        }
      ]
    });
    expect(analysis.accountAnalyses).toHaveLength(2);
    expect(analysis.caveats).toEqual(["公开数据有限"]);
  });

  it("rejects malformed provider output", () => {
    expect(() => parseLlmAnalysis("not json")).toThrow("LLM response did not include");
  });

  it("rejects a winner that does not match the final combined score", () => {
    const content = JSON.stringify({
      summary: "beta 更强。",
      winner: {
        username: "beta",
        reason: "模型偏向 beta。",
        confidence: "medium"
      },
      accountScores: [
        {
          username: "alpha",
          score: 70,
          reason: "alpha 系统分优势明显。"
        },
        {
          username: "beta",
          score: 72,
          reason: "beta 模型分略高。"
        }
      ],
      dimensionInsights: [],
      accountAnalyses: [
        {
          username: "alpha",
          strengths: [],
          risks: [],
          recommendations: []
        },
        {
          username: "beta",
          strengths: [],
          risks: [],
          recommendations: []
        }
      ],
      caveats: [],
      sources: [
        {
          id: "profile-alpha",
          label: "alpha profile",
          url: "https://github.com/alpha",
          note: "Profile source."
        }
      ]
    });

    expect(() =>
      parseLlmAnalysis(
        content,
        ["alpha", "beta"],
        [
          {
            username: "alpha",
            totalScore: 90
          },
          {
            username: "beta",
            totalScore: 60
          }
        ]
      )
    ).toThrow("highest final combined score");
  });
});
