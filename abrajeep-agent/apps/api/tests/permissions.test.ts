import { describe, expect, it } from 'vitest';
import {
  audiencesForRole,
  canAccessAdminPanel,
  canReadDocument,
  type AccessContext,
} from '@abrajeep/shared';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const DEALER_1 = 'dealer-1';
const DEALER_2 = 'dealer-2';

const visitor: AccessContext = { role: 'VISITOR', organizationId: null, dealershipId: null };
const associate: AccessContext = { role: 'ASSOCIATE', organizationId: ORG_A, dealershipId: null };
const dealer1User: AccessContext = {
  role: 'DEALERSHIP',
  organizationId: ORG_A,
  dealershipId: DEALER_1,
};
const managerA: AccessContext = { role: 'MANAGER', organizationId: ORG_A, dealershipId: null };
const admin: AccessContext = { role: 'ADMIN', organizationId: ORG_A, dealershipId: null };

describe('audiencesForRole', () => {
  it('visitante só lê conteúdo público', () => {
    expect(audiencesForRole('VISITOR')).toEqual(['PUBLIC']);
  });
  it('admin lê todas as audiências', () => {
    expect(audiencesForRole('ADMIN')).toContain('ADMIN');
  });
});

describe('canReadDocument — isolamento entre organizações', () => {
  it('usuário da organização A não lê documento interno da organização B', () => {
    expect(
      canReadDocument(associate, {
        audience: 'ASSOCIATES',
        organizationId: ORG_B,
        dealershipId: null,
      }),
    ).toBe(false);
  });

  it('nem admin da organização A lê documento restrito da organização B', () => {
    expect(
      canReadDocument(admin, { audience: 'INTERNAL', organizationId: ORG_B, dealershipId: null }),
    ).toBe(false);
  });

  it('documento público é lido por qualquer perfil, de qualquer organização', () => {
    expect(
      canReadDocument(visitor, { audience: 'PUBLIC', organizationId: ORG_B, dealershipId: null }),
    ).toBe(true);
  });
});

describe('canReadDocument — isolamento entre concessionárias', () => {
  const docDealer2 = { audience: 'DEALERSHIP' as const, organizationId: ORG_A, dealershipId: DEALER_2 };

  it('usuário da concessionária 1 NÃO lê documento da concessionária 2', () => {
    expect(canReadDocument(dealer1User, docDealer2)).toBe(false);
  });

  it('usuário da concessionária 1 lê documento da própria concessionária', () => {
    expect(
      canReadDocument(dealer1User, {
        audience: 'DEALERSHIP',
        organizationId: ORG_A,
        dealershipId: DEALER_1,
      }),
    ).toBe(true);
  });

  it('gestor da organização lê documentos de qualquer concessionária da org', () => {
    expect(canReadDocument(managerA, docDealer2)).toBe(true);
  });

  it('visitante nunca lê documento de concessionária', () => {
    expect(canReadDocument(visitor, docDealer2)).toBe(false);
  });
});

describe('canReadDocument — audiências', () => {
  it('associado não lê documento INTERNAL', () => {
    expect(
      canReadDocument(associate, { audience: 'INTERNAL', organizationId: ORG_A, dealershipId: null }),
    ).toBe(false);
  });
  it('somente admin lê documento ADMIN', () => {
    expect(
      canReadDocument(managerA, { audience: 'ADMIN', organizationId: ORG_A, dealershipId: null }),
    ).toBe(false);
    expect(
      canReadDocument(admin, { audience: 'ADMIN', organizationId: ORG_A, dealershipId: null }),
    ).toBe(true);
  });
});

describe('canAccessAdminPanel', () => {
  it('permite operador, gestor e admin; nega demais', () => {
    expect(canAccessAdminPanel('OPERATOR')).toBe(true);
    expect(canAccessAdminPanel('MANAGER')).toBe(true);
    expect(canAccessAdminPanel('ADMIN')).toBe(true);
    expect(canAccessAdminPanel('ASSOCIATE')).toBe(false);
    expect(canAccessAdminPanel('VISITOR')).toBe(false);
    expect(canAccessAdminPanel('DEALERSHIP')).toBe(false);
  });
});
