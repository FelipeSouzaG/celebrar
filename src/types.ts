export type Role = "ADMIN" | "GERENTE" | "OPERADOR";

export interface LoginResponse {
  token?: string;
  user: {
    id: string;
    name: string;
    role: Role;
  };
}

export interface Produto {
  id: string;
  codigo_barras: string;
  nome: string;
  localizacao?: string;
  categoria?: string | null;
  codigoCatalogo?: string | null;
  embalagemTipo?: string | null;
  embalagemUnidade?: string | null;
  embalagemQuantidade?: number;
  precoEmbalagem?: number;
  precoUnidade?: number;
  custo_produto: number;
  margem_minima?: number;
  preco_varejo: number;
  preco_atacado: number;
  qtd_atacado: number;
  estoque: number;

  // BI Fields (Calculated by backend)
  lotesCount?: number;
  giroMensal?: number;
  giroDiario?: number;
  coberturaDias?: number;
  fornecedor?: { id: string; nome: string; prazoEntrega?: string | null };
}

export interface Lote {
  id: string;
  numeroLote: string;
  dataValidade: string | null;
  qtdInicial: number;
  qtdAtual: number;
  status: string;
}

export interface HistoricoCompra {
  id: string;
  data: string;
  fornecedor: string;
  qtd: number;
  custo_un: number;
}

export interface MovimentacaoEstoque {
  id: string;
  tipo: string;
  qtd: number;
  motivo: string;
  data: string;
}

export interface ProdutoDetalhesResponse {
  produto: Produto & { fornecedor?: { nome: string } };
  lotes: Lote[];
  historicoCompras: HistoricoCompra[];
  movimentacoes: MovimentacaoEstoque[];
  kpis: {
    vendas30Dias: number;
    coberturaEstoqueDias: number;
    ultimoCusto: number;
  };
}

export interface Cliente {
  id: string;
  nome: string;
  documento: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  contatoNome: string | null;
  contatoTelefone: string | null;
  contatoEmail: string | null;
}

export interface Fornecedor {
  id: string;
  nome: string;
  cnpj: string;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  contatoNome: string | null;
  contatoTelefone: string | null;
  contatoEmail: string | null;
  prazoEntrega: string | null;
  diaEntrega: string | null;

  // BI
  produtosCount?: number;
  lotesCount?: number;
}

export interface FornecedorDetalhesResponse {
  fornecedor: Fornecedor;
  produtos: Produto[];
  historicoCompras: Compra[];
  financeiro: {
    totalComprado: number;
    totalPendente: number;
    ultimaCompra: string | null;
  };
}

export interface ClienteDetalhesResponse {
  cliente: Cliente;
  historicoCompras: Array<{
    id: string;
    codigo?: string;
    data_venda: string;
    total: number;
    status: string;
    itens: Array<{
      id: string;
      produtoId: string;
      qtd: number;
      preco_un_aplicado: number;
      produto: { nome: string; codigo_barras: string };
    }>;
  }>;
}

export interface UsuarioAdmin {
  id: string;
  nome: string;
  login: string;
  role: Role;
  senha?: string;
}

export interface Compra {
  id: string;
  codigo?: string;
  referencia?: string;
  fornecedorId: string;
  fornecedor?: Fornecedor;
  data_compra: string;

  total: number;
  frete?: number;
  outrasDespesas?: number;
  descontoGeral?: number;

  itens: ItemCompra[];
  despesasGeradas?: any[]; // Para contagem de parcelas no frontend

  status?: "PAGO" | "PENDENTE";
  dataVencimento?: string;
  dataPagamento?: string;
  contaBancariaId?: string;
  parcelas?: number;
  formaPagamento?: "DINHEIRO_CAIXA" | "BOLETO"; // Para status PENDENTE
  numeroParcelas?: number; // Para boleto: 1-5
}

export interface ItemCompra {
  id?: string;
  produtoId: string;
  produto?: Produto;
  qtd: number;
  custo_un: number;
  // Lote Info
  numeroLote?: string;
  dataValidade?: string;
}

export interface TransacaoFinanceira {
  id: string;
  tipo: "ENTRADA" | "SAIDA";
  origem: "VENDA" | "COMPRA" | "DESPESA";
  descricao: string;
  valor: number;
  data: string;
  // Campos específicos de Despesa
  status?: "PAGO" | "PENDENTE" | "CONCLUIDO";
  dataVencimento?: string;
  dataPagamento?: string;
  contaBancariaId?: string;
  categoria?: string;
  // Campos para Fatura Virtual
  isFatura?: boolean;
}

export interface DespesaPayload {
  descricao: string;
  valor: number;
  categoria: string;
  status: "PAGO" | "PENDENTE";
  dataVencimento: string;
  dataPagamento?: string;
  contaBancariaId?: string;
  parcelas?: number;
}

export interface ContaBancaria {
  id: string;
  nome: string;
  tipo: string;
  tipoUso?: "PAGAMENTO" | "RECEBIMENTO"; // Novo campo
  ativa: boolean;
  diaFechamento?: number;
  diaVencimento?: number;
}

export interface ExtratoItem {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: "SAIDA";
  categoria?: string;
  status?: "PAGO" | "PENDENTE";
  dataVencimento?: string;
}

export interface ExtratoConta {
  total: number;
  itens: ExtratoItem[];
}

// --- TIPOS DE VENDA E SESSÃO ---

export interface ItemVenda {
  id: string;
  produtoId: string;
  qtd: number;
  preco_un_aplicado: number;
  produto: {
    nome: string;
    codigo_barras: string;
  };
}

export interface VendaAdmin {
  id: string;
  codigo?: string;
  data_venda: string;
  total: number;
  tipo_pagamento: string;
  itens: ItemVenda[];
  contaBancaria?: {
    id: string;
    nome: string;
    tipo: string;
  } | null;
}

export interface NfeResult {
  enabled: boolean;
  attempted: boolean;
  authorized: boolean;
  homologacao?: boolean;
  naturezaOperacao?: string;
  dataEmissao?: string;
  chaveAcesso?: string;
  numero?: number;
  serie?: number;
  protocolo?: string;
  dataAutorizacao?: string;
  statusCode?: string;
  statusMessage?: string;
  consultaUrl?: string;
  emitente?: {
    nome?: string;
    cnpj?: string;
    ie?: string;
    fone?: string;
    endereco?: {
      logradouro?: string;
      numero?: string;
      complemento?: string;
      bairro?: string;
      cidade?: string;
      uf?: string;
      cep?: string;
    };
  };
  destinatario?: {
    nome?: string;
    documento?: string;
    documentoTipo?: string;
    ie?: string;
    endereco?: {
      logradouro?: string;
      numero?: string;
      complemento?: string;
      bairro?: string;
      cidade?: string;
      uf?: string;
      cep?: string;
    };
  };
  totais?: {
    vBC?: string;
    vICMS?: string;
    vProd?: string;
    vFrete?: string;
    vOutro?: string;
    vNF?: string;
  };
}

export interface VendaDiretaMutationResponse {
  success: boolean;
  venda: VendaAdmin;
  nfe?: NfeResult;
}

export interface MovimentacaoCaixaAdmin {
  id: string;
  tipo: "SANGRIA" | "SUPRIMENTO";
  valor: number;
  descricao: string;
  data: string;
}

export interface SessaoCaixaAdmin {
  id: string;
  data_abertura: string;
  data_fechamento: string | null;
  usuario: { nome: string };

  saldo_inicial: number;
  saldo_final_declarado: number | null;
  quebra_caixa: number | null;
  status: "ABERTO" | "FECHADO";

  // Agregados vindos do _count na listagem ou detalhados
  _count?: { vendas: number };

  // Detalhes completos (quando carregados)
  vendas?: VendaAdmin[];
  movimentacoes?: MovimentacaoCaixaAdmin[];

  // Totais calculados
  total_vendas?: number;
  total_dinheiro?: number;
  total_cartao?: number;
  total_pix?: number;
  total_sangrias?: number;
  total_suprimentos?: number;

  // Breakdown por conta de recebimento
  totais_por_conta?: Record<
    string,
    { id: string; nome: string; tipo: string; total: number }
  >;
  resumo?: { total_dinheiro: number; total_outras_formas: number };
}

