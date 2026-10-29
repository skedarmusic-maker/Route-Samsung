import deParaJson from './de_para_pdv.json';

const mapNovo: Record<string, string> = (deParaJson as any).map_novo_para_antigo || {};
const mapCod: Record<string, string> = (deParaJson as any).map_codigo_para_antigo || {};

/**
 * Retorna o NOME PDV ANTIGO (padrão oficial Samsung / Manuela do board do Monday 18401785855)
 * Utilizado exclusivamente na exportação do arquivo Excel.
 * O formato interno (com endereço e código SAP completo para uMov.me) é mantido intacto no sistema.
 */
export function getNomePdvAntigo(loja: any): string {
  if (!loja) return '';
  const nomePdv = (loja.nome_pdv || '').trim();
  const filial = (loja.filial || '').trim();
  const codigo = (loja.codigo || '').trim();

  // 1. Match exato pelo nome_pdv novo
  if (mapNovo[nomePdv]) {
    return mapNovo[nomePdv];
  }

  // 2. Match por prefixo do código Protrade ou código direto (Sxxxxx)
  if (codigo && mapCod[codigo]) {
    return mapCod[codigo];
  }

  if (nomePdv.startsWith('S') && nomePdv.includes(' - ')) {
    const cod = nomePdv.split(' - ')[0].trim();
    if (mapCod[cod]) {
      return mapCod[cod];
    }
  }

  // 3. Se tiver filial limpa (ex: "FRIGELAR - SJC", "CLIMA RIO - BOA VIAGEM"), usar filial
  if (filial && filial.length > 3) {
    return filial;
  }

  return nomePdv;
}
