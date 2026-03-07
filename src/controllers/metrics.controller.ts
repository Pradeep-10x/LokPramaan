/**
 * WitnessLedger — Metrics controller
 * Computes on-demand KPIs from the database.
 */
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma/client';
import { IssueStatus } from '../generated/prisma/client.js';

export async function getMetrics(req: Request, res: Response, next: NextFunction) {
  try {
    const rawWardId = req.query.wardId as string | undefined;
    const baseWhere = rawWardId ? { wardId: rawWardId } : {};

    const totalIssues = await prisma.issue.count({ where: baseWhere });
    const verifiedIssues = await prisma.issue.count({ 
      where: { ...baseWhere, status: IssueStatus.VERIFIED } 
    });
    const openIssues = await prisma.issue.count({
      where: { ...baseWhere, status: IssueStatus.OPEN }
    });
    
    // Ongoing issues: Accepted, Assigned, In_Progress, Work_Done 
    const ongoingIssues = await prisma.issue.count({
      where: {
         ...baseWhere,
         status: {
           notIn: [IssueStatus.OPEN, IssueStatus.VERIFIED, IssueStatus.REJECTED]
         }
      }
    });

    // Average resolution time: from ASSIGNED → VERIFIED
    const verifiedWithAssignment = await prisma.issue.findMany({
      where: { ...baseWhere, status: IssueStatus.VERIFIED },
      select: { createdAt: true, updatedAt: true, slaDeadline: true },
    });

    let totalResolutionHours = 0;
    let slaCompliant = 0;
    for (const issue of verifiedWithAssignment) {
      const hours = (issue.updatedAt.getTime() - issue.createdAt.getTime()) / (1000 * 60 * 60);
      totalResolutionHours += hours;
      if (issue.slaDeadline && issue.updatedAt <= issue.slaDeadline) {
        slaCompliant++;
      }
    }

    const avgResolutionTimeHours =
      verifiedWithAssignment.length > 0
        ? Math.round((totalResolutionHours / verifiedWithAssignment.length) * 100) / 100
        : null;

    // Proof coverage: issues with both BEFORE and AFTER evidence
    const issuesWithBefore = await prisma.evidence.findMany({
      where: { type: 'BEFORE', issue: baseWhere },
      select: { issueId: true },
      distinct: ['issueId'],
    });
    const issuesWithAfter = await prisma.evidence.findMany({
      where: { type: 'AFTER', issue: baseWhere },
      select: { issueId: true },
      distinct: ['issueId'],
    });

    const beforeSet = new Set(issuesWithBefore.map((e) => e.issueId));
    const bothCount = issuesWithAfter.filter((e) => beforeSet.has(e.issueId)).length;

    res.json({
      total_issues: totalIssues,
      open_issues: openIssues,
      ongoing_issues: ongoingIssues,
      verified_issues: verifiedIssues,
      verified_percent: totalIssues > 0 ? Math.round((verifiedIssues / totalIssues) * 10000) / 100 : 0,
      avg_resolution_time_hours: avgResolutionTimeHours,
      sla_compliance_percent:
        verifiedWithAssignment.length > 0
          ? Math.round((slaCompliant / verifiedWithAssignment.length) * 10000) / 100
          : null,
      proof_coverage_count: bothCount,
      proof_coverage_percent:
        totalIssues > 0 ? Math.round((bothCount / totalIssues) * 10000) / 100 : 0,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAdvancedMetrics(req: Request, res: Response, next: NextFunction) {
  try {
    const rawWardId = req.query.wardId as string | undefined;
    const baseWhere = rawWardId ? { wardId: rawWardId } : {};

    const totalIssues = await prisma.issue.count({ where: baseWhere });
    const verifiedIssues = await prisma.issue.count({ 
      where: { ...baseWhere, status: IssueStatus.VERIFIED } 
    });
    const openIssues = await prisma.issue.count({
      where: { ...baseWhere, status: IssueStatus.OPEN }
    });

    // Ongoing issues: Accepted, Assigned, In_Progress, Work_Done 
    const ongoingIssues = await prisma.issue.count({
      where: {
         ...baseWhere,
         status: {
           notIn: [IssueStatus.OPEN, IssueStatus.VERIFIED, IssueStatus.REJECTED]
         }
      }
    });

    // Average resolution time
    const verifiedWithAssignment = await prisma.issue.findMany({
      where: { ...baseWhere, status: IssueStatus.VERIFIED },
      select: { createdAt: true, updatedAt: true, slaDeadline: true },
    });

    let totalResolutionHours = 0;
    let slaCompliant = 0;
    for (const issue of verifiedWithAssignment) {
      const hours = (issue.updatedAt.getTime() - issue.createdAt.getTime()) / (1000 * 60 * 60);
      totalResolutionHours += hours;
      if (issue.slaDeadline && issue.updatedAt <= issue.slaDeadline) {
        slaCompliant++;
      }
    }

    const avgResolutionTimeHours =
      verifiedWithAssignment.length > 0
        ? Math.round((totalResolutionHours / verifiedWithAssignment.length) * 100) / 100
        : null;

    // Proof coverage
    const issuesWithBefore = await prisma.evidence.findMany({
      where: { type: 'BEFORE', issue: baseWhere },
      select: { issueId: true },
      distinct: ['issueId'],
    });
    const issuesWithAfter = await prisma.evidence.findMany({
      where: { type: 'AFTER', issue: baseWhere },
      select: { issueId: true },
      distinct: ['issueId'],
    });

    const beforeSet = new Set(issuesWithBefore.map((e) => e.issueId));
    const bothCount = issuesWithAfter.filter((e) => beforeSet.has(e.issueId)).length;

    // 1. Ward-wise heatmap (Group by wardId)
    const wardGroups = await prisma.issue.groupBy({
      by: ['wardId'],
      _count: { _all: true },
      // Important to filter by baseWhere here or an officer just gets 1 ward in the chart
      where: { ...baseWhere, status: { not: IssueStatus.REJECTED } }
    });
    const wards = await prisma.adminUnit.findMany({ where: { id: { in: wardGroups.map(w => w.wardId) } }, select: { id: true, name: true }});
    const wardMap = new Map(wards.map(w => [w.id, w.name]));
    const wardHeatmap = wardGroups.map(g => ({
      wardId: g.wardId,
      wardName: wardMap.get(g.wardId) || 'Unknown',
      count: g._count._all,
    })).sort((a,b) => b.count - a.count);

    // 2. Department Breakdown
    const deptGroups = await prisma.issue.groupBy({
      by: ['department'],
      _count: { _all: true },
      where: baseWhere
    });
    const departmentBreakdown = deptGroups.map(g => ({
      department: g.department,
      count: g._count._all
    })).sort((a,b) => b.count - a.count);

    // 3. Officer Performance (Simplified top 10 officers by resolved)
    // We group by assignedToId for verified issues
    const officerGroups = await prisma.issue.groupBy({
      by: ['assignedToId'],
      _count: { _all: true },
      where: { ...baseWhere, status: IssueStatus.VERIFIED, assignedToId: { not: null } },
      orderBy: { _count: { assignedToId: 'desc' } },
      take: 10
    });

    const officerIds = officerGroups.map(o => o.assignedToId!).filter(Boolean);
    const officers = await prisma.user.findMany({ where: { id: { in: officerIds } }, select: { id: true, name: true } });
    const officerMap = new Map(officers.map(o => [o.id, o.name]));
    
    // Also get their pending counts
    const pendingGroups = await prisma.issue.groupBy({
      by: ['assignedToId'],
      _count: { _all: true },
      where: { assignedToId: { in: officerIds }, status: { notIn: [IssueStatus.VERIFIED, IssueStatus.COMPLETED, IssueStatus.REJECTED] } },
    });
    const pendingMap = new Map(pendingGroups.map(g => [g.assignedToId!, g._count._all]));

    const officerPerformance = officerGroups.map(g => ({
      officerId: g.assignedToId,
      officerName: officerMap.get(g.assignedToId!) || 'Unknown',
      verifiedCount: g._count._all,
      pendingCount: pendingMap.get(g.assignedToId!) || 0
    }));

    // 4. Trend over time (simplified - last 30 days grouped by day)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentIssues = await prisma.issue.findMany({
      where: { ...baseWhere, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, status: true }
    });

    const trendMap = new Map<string, { total: number, resolved: number }>();
    for (const issue of recentIssues) {
      const dateStr = issue.createdAt.toISOString().split('T')[0];
      if (!trendMap.has(dateStr)) trendMap.set(dateStr, { total: 0, resolved: 0 });
      const stats = trendMap.get(dateStr)!;
      stats.total++;
      if (issue.status === IssueStatus.VERIFIED || issue.status === IssueStatus.COMPLETED) {
        stats.resolved++;
      }
    }

    const trendLast30Days = Array.from(trendMap.entries()).map(([date, stats]) => ({
      date,
      totalOpened: stats.total,
      resolved: stats.resolved
    })).sort((a,b) => a.date.localeCompare(b.date));


    res.json({
      total_issues: totalIssues,
      open_issues: openIssues,
      ongoing_issues: ongoingIssues,
      verified_issues: verifiedIssues,
      verified_percent: totalIssues > 0 ? Math.round((verifiedIssues / totalIssues) * 10000) / 100 : 0,
      avg_resolution_time_hours: avgResolutionTimeHours,
      sla_compliance_percent:
        verifiedWithAssignment.length > 0
          ? Math.round((slaCompliant / verifiedWithAssignment.length) * 10000) / 100
          : null,
      proof_coverage_count: bothCount,
      proof_coverage_percent:
        totalIssues > 0 ? Math.round((bothCount / totalIssues) * 10000) / 100 : 0,
      
      // Advanced metrics added for Command Center
      ward_heatmap: wardHeatmap,
      department_breakdown: departmentBreakdown,
      officer_performance: officerPerformance,
      trend_last_30_days: trendLast30Days
    });
  } catch (err) {
    next(err);
  }
}
