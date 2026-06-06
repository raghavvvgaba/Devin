export type RepoImportItem = {
  id: number;
  name: string;
  owner: string;
  fullName: string;
  private: boolean;
  status: "ready" | "needs_access";
};
