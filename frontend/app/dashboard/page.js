"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  clearStoredAdminAuth,
  getStoredAdminAuth,
  verifyAdminAccess,
  fetchWithAdminAuth,
} from "@/lib/admin-auth";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

export default function Dashboard() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [stockDetails, setStockDetails] = useState([]);
  const [salesDetails, setSalesDetails] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkAccess = async () => {
      const storedAuth = getStoredAdminAuth();
      if (!storedAuth?.token) {
        clearStoredAdminAuth();
        if (isMounted) {
          setIsAuthorized(false);
          setIsCheckingAuth(false);
          router.replace("/");
        }
        return;
      }

      try {
        await verifyAdminAccess(storedAuth.token);
        if (isMounted) {
          setIsAuthorized(true);
          setIsCheckingAuth(false);
        }
      } catch {
        clearStoredAdminAuth();
        if (isMounted) {
          setIsAuthorized(false);
          setIsCheckingAuth(false);
          router.replace("/");
        }
      }
    };

    checkAccess();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!isAuthorized) return;

    let isMounted = true;
    const fetchData = async () => {
      try {
        const [stockRes, salesRes] = await Promise.all([
          fetchWithAdminAuth(`${API_BASE_URL}/api/opening-stock/`),
          fetchWithAdminAuth(`${API_BASE_URL}/items/`)
        ]);

        if (stockRes.ok && isMounted) {
          const stockJson = await stockRes.json();
          setStockDetails(stockJson?.rows || []);
        }

        if (salesRes.ok && isMounted) {
          const salesJson = await salesRes.json();
          setSalesDetails(salesJson || []);
        }
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        if (isMounted) setIsLoadingData(false);
      }
    };
    fetchData();

    return () => {
      isMounted = false;
    };
  }, [isAuthorized]);

  if (isCheckingAuth || !isAuthorized) {
    return null;
  }

  return (
    <div className="p-6 w-full">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Opening Stock Card */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 flex flex-col">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Opening Stock Details</h2>
          {isLoadingData ? (
            <p className="text-slate-500 text-sm">Loading...</p>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 font-medium">Item Code</th>
                    <th className="px-4 py-3 font-medium">Item Name</th>
                    <th className="px-4 py-3 font-medium">Unit</th>
                    <th className="px-4 py-3 font-medium">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {stockDetails.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-4 py-4 text-center text-slate-500">No opening stock found.</td>
                    </tr>
                  ) : (
                    stockDetails.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-900">{item.itemCode || "-"}</td>
                        <td className="px-4 py-2">{item.itemName || "-"}</td>
                        <td className="px-4 py-2">{item.unit || "-"}</td>
                        <td className="px-4 py-2">{item.quantity ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sales Details Card */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 flex flex-col">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Sales Details</h2>
          {isLoadingData ? (
            <p className="text-slate-500 text-sm">Loading...</p>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 font-medium">Bill Type</th>
                    <th className="px-4 py-3 font-medium">Item Name</th>
                    <th className="px-4 py-3 font-medium">Qty</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {salesDetails.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-4 py-4 text-center text-slate-500">No sales found.</td>
                    </tr>
                  ) : (
                    salesDetails.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2">{item.bill_type || "-"}</td>
                        <td className="px-4 py-2 font-medium text-slate-900">{item.item_name || "-"}</td>
                        <td className="px-4 py-2">{item.quantity ?? "-"}</td>
                        <td className="px-4 py-2">{item.amount ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
