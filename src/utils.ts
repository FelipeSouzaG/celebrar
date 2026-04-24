const TIME_ZONE = "America/Sao_Paulo";

export const formatMoney = (val: number | undefined) =>
  (val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const toParts = (d: string | Date) => {
  const date = d instanceof Date ? d : new Date(d);
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
};

export const formatDate = (d: string) => {
  if (!d) return "";
  const p = toParts(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
};

export const formatDateOnly = (d: string) => {
  if (!d) return "";
  const p = toParts(d);
  return `${p.day}/${p.month}/${p.year}`;
};

export const toInputDate = (d?: string | Date) => {
  if (!d) return "";
  const p = toParts(d);
  return `${p.year}-${p.month}-${p.day}`;
};

export const todayInputDate = () => toInputDate(new Date());

export const cleanDigits = (value: string) => value.replace(/\D/g, "");

export const maskCEP = (value: string) => {
  const v = value.replace(/\D/g, "");
  if (v.length > 5) return v.replace(/^(\d{5})(\d)/, "$1-$2");
  return v;
};

export const formatCPFCNPJ = (value: string | undefined) => {
  if (!value) return "";
  const v = value.replace(/\D/g, "");
  if (v.length <= 11)
    return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
};

export const formatPhone = (value: string | undefined) => {
  if (!value) return "";
  const v = value.replace(/\D/g, "");
  if (v.length > 10) return v.replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3");
  return v.replace(/^(\d{2})(\d{4})(\d{4}).*/, "($1) $2-$3");
};

// Nova função que retorna Promise com dados ou erro
export const fetchCep = async (cep: string) => {
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) return null;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const data = await res.json();
    if (data.erro) throw new Error("CEP não encontrado");

    return {
      cep: clean,
      rua: data.logradouro,
      bairro: data.bairro,
      cidade: data.localidade,
      estado: data.uf,
    };
  } catch (e) {
    throw e;
  }
};

// Mantida para compatibilidade legada se necessário, mas os componentes novos usarão fetchCep
export const checkCep = async (
  cep: string | undefined,
  setForm: (data: any) => void,
  currentForm: any,
) => {
  if (!cep) return;
  const clean = cep.replace(/\D/g, "");
  if (clean.length === 8) {
    try {
      const data = await fetchCep(clean);
      if (data) {
        setForm({ ...currentForm, ...data });
      }
    } catch {}
  }
};
