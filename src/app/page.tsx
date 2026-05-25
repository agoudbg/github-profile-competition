import { ComparisonTool } from "@/components/ComparisonTool";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getFirstSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = (await searchParams) ?? {};
  const initialUsers = {
    left: getFirstSearchParam(params.a),
    right: getFirstSearchParam(params.b)
  };

  return (
    <main className="page-shell">
      <ComparisonTool initialUsers={initialUsers} />
    </main>
  );
}
