import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('branch administration authority',()=>{
  it('keeps branch creation and lifecycle out of the owner workspace',()=>{
    const owner=readFileSync('src/features/management/OwnerDashboard.tsx','utf8');
    expect(owner).not.toContain('createOwnerBranch');
    expect(owner).not.toContain('updateOwnerBranch');
    expect(owner).not.toContain('Add inactive branch');
  });

  it('revokes owner branch RPC access and gates admin mutations with MFA admin identity',()=>{
    const migration=readFileSync('supabase/migrations/20261104100000_admin_branch_authority_and_domain_storefront.sql','utf8');
    expect(migration).toContain('IF NOT private.is_platform_admin()');
    expect(migration).toContain('public.create_owner_branch(uuid, text, text)');
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('public.system_admin_create_branch');
  });
});
