export interface CompanySite {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

export interface SiteDirectory {
  listByCompany(companyId: string): Promise<readonly CompanySite[]>;
}
