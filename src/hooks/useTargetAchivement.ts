import { supabase } from "@/integrations/supabase/client";
import React from "react";
import { toast } from "sonner";

export default function useTargetAchievement(user) {
  const [targetAchievement, setTargetAchievement] = React.useState({
    revenue: { actual: 0, target: 0, percentage: 0 },
    margin: { actual: 0, target: 0, percentage: 0 },
  });

  React.useEffect(() => {
    if (!user?.id) return;

    const fetchAchievement = async () => {
      try {
        const { data: opportunities, error: oppError } = await supabase
          .from("opportunities")
          .select(
            "id, amount, status, stage, is_won, is_closed, expected_close_date"
          )
          .eq("owner_id", user.id);

        if (oppError) throw oppError;

        // --- 1️⃣ Hitung total revenue dari deals yang WON ---
        const wonOpps = opportunities.filter(
          (opp) => opp.status === "won" || opp.is_won === true
        );

        const wonOpportunityIds = wonOpps.map((opp) => opp.id);

        // --- 2️⃣ Hitung margin HANYA dari opportunities yang sudah punya project dan cost data ---
        // Margin hanya terisi setelah form add project di-submit, bukan saat status "won"
        let wonAmount = 0;
        let totalCosts = 0;
        
        // Ambil projects untuk opportunities yang won
        const { data: projects, error: projectsError } = await supabase
          .from("projects")
          .select("opportunity_id, po_amount")
          .in("opportunity_id", wonOpportunityIds);
        
        if (projectsError) throw projectsError;
        
        if (projects && projects.length > 0) {
          // Revenue dari projects (bukan dari opportunities)
          wonAmount = projects.reduce((sum, p) => sum + (Number(p.po_amount) || 0), 0);
          const projectOppIds = projects.map((p) => p.opportunity_id).filter(Boolean);
          
          // Ambil biaya dari pipeline_items yang sudah punya project
          const { data: pipelineItems, error: pipelineError } = await supabase
            .from("pipeline_items")
            .select(
              "opportunity_id, cost_of_goods, service_costs, other_expenses, status"
            )
            .in("opportunity_id", projectOppIds)
            .eq("status", "won");

          if (pipelineError) throw pipelineError;

          // Filter: hanya hitung margin dari pipeline_items yang punya cost data
          const pipelineItemsWithCosts = (pipelineItems || []).filter((item) => {
            const totalItemCost =
              (item.cost_of_goods || 0) +
              (item.service_costs || 0) +
              (item.other_expenses || 0);
            // Hanya hitung jika total cost > 0 (sudah ada cost data dari form add project)
            return totalItemCost > 0;
          });

          totalCosts =
            pipelineItemsWithCosts.reduce((sum, item) => {
              const totalItemCost =
                (item.cost_of_goods || 0) +
                (item.service_costs || 0) +
                (item.other_expenses || 0);
              return sum + totalItemCost;
            }, 0) || 0;
        }

        const totalMargin = wonAmount - totalCosts;

        // --- 3️⃣ Ambil sales target berdasarkan user (pakai profile.id) ---
        const { data: profile, error: profileError } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        const { data: salesTargets, error: targetError } = await supabase
          .from("sales_targets")
          .select("amount, measure, created_at")
          .eq("assigned_to", profile?.id)
          .order("created_at", { ascending: false });

        if (targetError) throw targetError;

        // --- 4️⃣ Pisahkan target berdasarkan measure ---
        const revenueTarget =
          salesTargets?.find((t) => t.measure === "revenue")?.amount || 0;
        const marginTarget =
          salesTargets?.find((t) => t.measure === "margin")?.amount || 0;

        // --- 5️⃣ Hitung persentase pencapaian ---
        const revenuePercentage =
          revenueTarget > 0 ? (wonAmount / revenueTarget) * 100 : 0;
        const marginPercentage =
          marginTarget > 0 ? (totalMargin / marginTarget) * 100 : 0;

        // --- 6️⃣ Set hasil ke state ---
        setTargetAchievement({
          revenue: {
            actual: wonAmount,
            target: revenueTarget,
            percentage: revenuePercentage,
          },
          margin: {
            actual: totalMargin,
            target: marginTarget,
            percentage: marginPercentage,
          },
        });
      } catch (err) {
        console.error("Error calculating achievement:", err);
        toast.error("Failed to fetch target achievement");
      }
    };

    fetchAchievement();
  }, [user?.id]);

  return targetAchievement;
}
