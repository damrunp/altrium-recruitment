const STATUS_STYLES = {
  pending: "bg-gold-100 text-gold-800",
  shortlisted: "bg-blue-100 text-blue-700",
  interview: "bg-purple-100 text-purple-700",
  rejected: "bg-red-100 text-red-700",
  hired: "bg-green-100 text-green-700",
};

export default function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || "bg-gray-100 text-gray-700";
  return <span className={`badge ${style}`}>{status}</span>;
}
