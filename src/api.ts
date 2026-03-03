import {
  Cliente,
  ClienteDetalhesResponse,
  Compra,
  ContaBancaria,
  DespesaPayload,
  ExtratoConta,
  Fornecedor,
  FornecedorDetalhesResponse,
  LoginResponse,
  Produto,
  ProdutoDetalhesResponse,
  SessaoCaixaAdmin,
  TransacaoFinanceira,
  UsuarioAdmin,
} from "./types";

// Em DEV: usa string vazia para bater no proxy do Vite
const API_URL = (import.meta as any).env.DEV
  ? ""
  : (import.meta as any).env.VITE_ADMIN_API_URL || "https://api.celebrar.local";

class AdminApi {
  clearSession() {
    localStorage.removeItem("admin_user");
  }

  private getCsrfToken() {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(
      /(?:^|; )celebrar_csrf=([^;]+)/,
    );
    return match ? decodeURIComponent(match[1]) : null;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}) {
    const hasBody = options.body !== undefined && options.body !== null;
    const headers = {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(this.getCsrfToken()
        ? { "X-CSRF-Token": this.getCsrfToken() }
        : {}),
    };

    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

    const response = await fetch(`${API_URL}${cleanEndpoint}`, {
      ...options,
      credentials: "include",
      headers: { ...headers, ...options.headers },
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("[Admin API Error]", {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        payload,
      });
      throw new Error(payload?.error || `Erro ${response.status}`);
    }

    return payload as T;
  }

  async login(login: string, senha: string) {
    const result = await this.request<LoginResponse>("/login", {
      method: "POST",
      body: JSON.stringify({ login, senha }),
    });

    localStorage.setItem("admin_user", JSON.stringify(result.user));
    return result.user;
  }

  async logout() {
    try {
      await this.request<{ success: boolean }>("/logout", { method: "POST" });
    } finally {
      this.clearSession();
    }
  }

  // Novo método para atualização do próprio perfil
  async updateProfile(data: { nome: string; login: string; senha?: string }) {
    const result = await this.request<{ success: boolean; user: any }>(
      "/profile",
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    );

    // Atualiza o user local
    const currentUser = this.getStoredUser();
    if (currentUser) {
      const newUser = { ...currentUser, ...result.user };
      localStorage.setItem("admin_user", JSON.stringify(newUser));
    }
    return result.user;
  }

  getStoredUser() {
    const raw = localStorage.getItem("admin_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // --- Produtos ---
  getProdutos() {
    return this.request<Produto[]>("/admin/produtos");
  }
  searchProdutos(q: string) {
    const query = q ? `?q=${encodeURIComponent(q)}` : "";
    return this.request<Produto[]>(`/admin/produtos${query}`);
  }
  getProdutoDetalhes(id: string) {
    return this.request<ProdutoDetalhesResponse>(
      `/admin/produtos/${id}/detalhes`,
    );
  }
  createProduto(data: any) {
    return this.request<Produto>("/admin/produtos", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
  updateProduto(id: string, data: any) {
    return this.request<Produto>(`/admin/produtos/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }
  deleteProduto(id: string) {
    return this.request<{ success: boolean }>(`/admin/produtos/${id}`, {
      method: "DELETE",
    });
  }

  // Novo método para ajuste de estoque (Gerente)
  ajustarEstoque(
    id: string,
    motivo: string,
    ajustes: Array<{ loteId: string; novaQtd: number }>,
  ) {
    return this.request(`/admin/produtos/${id}/ajuste`, {
      method: "POST",
      body: JSON.stringify({ motivo, ajustes }),
    });
  }

  // --- SUPER ADMIN (PRODUTOS) ---
  adminUpdateLote(id: string, data: any) {
    return this.request(`/admin/lotes/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }
  adminDeleteLote(id: string) {
    return this.request(`/admin/lotes/${id}`, { method: "DELETE" });
  }
  adminDeleteMovimentacao(id: string) {
    return this.request(`/admin/movimentacoes/${id}`, { method: "DELETE" });
  }
  adminDeleteItemCompra(id: string) {
    return this.request(`/admin/itens-compra/${id}`, { method: "DELETE" });
  }

  // --- Clientes ---
  getClientes(q?: string) {
    const query = q ? `?q=${encodeURIComponent(q)}` : "";
    return this.request<Cliente[]>(`/admin/clientes${query}`);
  }
  getClienteDetalhes(id: string) {
    return this.request<ClienteDetalhesResponse>(
      `/admin/clientes/${id}/detalhes`,
    );
  }
  createCliente(data: any) {
    return this.request<Cliente>("/admin/clientes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
  updateCliente(id: string, data: any) {
    return this.request<Cliente>(`/admin/clientes/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }
  deleteCliente(id: string) {
    return this.request<{ success: boolean }>(`/admin/clientes/${id}`, {
      method: "DELETE",
    });
  }

  // --- Fornecedores ---
  getFornecedores() {
    return this.request<Fornecedor[]>("/admin/fornecedores");
  }
  getFornecedorDetalhes(id: string) {
    return this.request<FornecedorDetalhesResponse>(
      `/admin/fornecedores/${id}/detalhes`,
    );
  }
  createFornecedor(data: any) {
    return this.request<Fornecedor>("/admin/fornecedores", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
  updateFornecedor(id: string, data: any) {
    return this.request<Fornecedor>(`/admin/fornecedores/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }
  deleteFornecedor(id: string) {
    return this.request<{ success: boolean }>(`/admin/fornecedores/${id}`, {
      method: "DELETE",
    });
  }

  // --- Usuários ---
  getUsuarios() {
    return this.request<UsuarioAdmin[]>("/admin/usuarios");
  }
  createUsuario(data: any) {
    return this.request<UsuarioAdmin>("/admin/usuarios", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
  updateUsuario(id: string, data: any) {
    return this.request<UsuarioAdmin>(`/admin/usuarios/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }
  deleteUsuario(id: string) {
    return this.request<{ success: boolean }>(`/admin/usuarios/${id}`, {
      method: "DELETE",
    });
  }

  // --- Compras ---
  getCompras() {
    return this.request<Compra[]>("/admin/compras");
  }
  createCompra(data: any) {
    return this.request<Compra>("/admin/compras", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
  updateCompra(id: string, data: any) {
    return this.request<Compra>(`/admin/compras/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }
  deleteCompra(id: string) {
    return this.request<{ success: boolean }>(`/admin/compras/${id}`, {
      method: "DELETE",
    });
  }

  // --- Financeiro ---
  getExtratoFinanceiro() {
    return this.request<TransacaoFinanceira[]>("/admin/financeiro");
  }
  createDespesa(data: DespesaPayload) {
    return this.request("/admin/despesas", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
  updateDespesa(id: string, data: DespesaPayload) {
    return this.request(`/admin/despesas/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }
  deleteDespesa(id: string) {
    return this.request(`/admin/despesas/${id}`, { method: "DELETE" });
  }

  // --- Contas Bancárias ---
  getContas(filter?: { tipo_uso?: "PAGAMENTO" | "RECEBIMENTO" }) {
    const query = filter?.tipo_uso ? `?tipo_uso=${filter.tipo_uso}` : "";
    return this.request<ContaBancaria[]>(`/admin/contas${query}`);
  }
  createConta(data: any) {
    return this.request<ContaBancaria>("/admin/contas", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
  updateConta(id: string, data: any) {
    return this.request<ContaBancaria>(`/admin/contas/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }
  deleteConta(id: string) {
    return this.request(`/admin/contas/${id}`, { method: "DELETE" });
  }
  getExtratoConta(id: string, mes: number, ano: number) {
    return this.request<ExtratoConta>(
      `/admin/contas/${id}/extrato?mes=${mes}&ano=${ano}`,
    );
  }

  // --- SESSÕES DE CAIXA (VENDAS) ---
  getSessoesCaixa() {
    return this.request<SessaoCaixaAdmin[]>("/admin/sessoes");
  }
  getSessaoDetalhes(id: string) {
    return this.request<SessaoCaixaAdmin>(`/admin/sessoes/${id}`);
  }

  // --- VENDAS DIRETAS (Pedidos / Entrega / Concluído)
  createVendaDireta(data: any) {
    return this.request<any>(`/admin/vendas-diretas`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  getVendasDiretas(filter?: { status?: string }) {
    const q = filter?.status
      ? `?status=${encodeURIComponent(filter.status)}`
      : "";
    return this.request<any[]>(`/admin/vendas-diretas${q}`);
  }

  updateVendaDireta(id: string, data: any) {
    return this.request<any>(`/admin/vendas-diretas/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  deleteVendaDireta(id: string) {
    return this.request<{ success: boolean }>(`/admin/vendas-diretas/${id}`, {
      method: "DELETE",
    });
  }

  updateVendaStatus(
    id: string,
    data: { status: string; contaBancariaId?: string },
  ) {
    return this.request<any>(`/admin/vendas/${id}/status`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // ADMIN DELETIONS
  deleteVenda(id: string) {
    return this.request<{ success: boolean }>(`/admin/vendas/${id}`, {
      method: "DELETE",
    });
  }
  deleteSessao(id: string) {
    return this.request<{ success: boolean }>(`/admin/sessoes/${id}`, {
      method: "DELETE",
    });
  }
}

export const adminApi = new AdminApi();
export { API_URL };
