"use client";

import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadarChart,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import type { RadarPoint } from "@/lib/types";

type RadarComparisonChartProps = {
  data: RadarPoint[];
  usernames: [string, string];
};

const chartColors = ["#0f766e", "#c05621"] as const;

export function RadarComparisonChart({ data, usernames }: RadarComparisonChartProps) {
  return (
    <div className="chart-frame" role="img" aria-label={`${usernames[0]} 与 ${usernames[1]} 的雷达图对比`}>
      <ResponsiveContainer width="100%" height={360}>
        <RechartsRadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#d8d1c3" />
          <PolarAngleAxis dataKey="dimension" tick={{ fill: "#30343b", fontSize: 12 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#6a707a", fontSize: 11 }} />
          <Radar
            name={usernames[0]}
            dataKey={usernames[0]}
            stroke={chartColors[0]}
            fill={chartColors[0]}
            fillOpacity={0.18}
            strokeWidth={2}
          />
          <Radar
            name={usernames[1]}
            dataKey={usernames[1]}
            stroke={chartColors[1]}
            fill={chartColors[1]}
            fillOpacity={0.16}
            strokeWidth={2}
          />
          <Tooltip />
          <Legend />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
