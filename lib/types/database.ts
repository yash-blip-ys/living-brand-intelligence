export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ContextItemType =
  | "FACT"
  | "INFERENCE"
  | "HYPOTHESIS"
  | "DECISION"
  | "REJECTED"
  | "SUPERSEDED";

export type ContextItemStatus = "active" | "archived";

export type BrandDecisionCategory =
  | "AUDIENCE"
  | "POSITIONING"
  | "VALUE_PROPOSITION"
  | "DIFFERENTIATION"
  | "PERSONALITY"
  | "NAMING"
  | "TAGLINE"
  | "VOICE"
  | "MESSAGING"
  | "VISUAL_DIRECTION"
  | "LAUNCH";

export type BrandDecisionStatus =
  | "proposed"
  | "active"
  | "rejected"
  | "superseded";

export type ContextRelationshipType =
  | "supports"
  | "derived_from"
  | "contradicts"
  | "affects"
  | "supersedes";

export type DecisionContextLinkType =
  | "supports"
  | "derived_from"
  | "contradicts"
  | "affects";

export type DecisionRelationshipType =
  | "supports"
  | "contradicts"
  | "affects"
  | "supersedes";

export type ChangeAnalysisStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "ignored";

export type ImpactSeverity = "low" | "medium" | "high";

export interface Database {
  public: {
    Tables: {
      startups: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          name: string;
          raw_idea: string | null;
          description: string | null;
          challenge_run: Json | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          name: string;
          raw_idea?: string | null;
          description?: string | null;
          challenge_run?: Json | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          name?: string;
          raw_idea?: string | null;
          description?: string | null;
          challenge_run?: Json | null;
        };
      };

      context_items: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          startup_id: string;
          type: ContextItemType;
          content: string;
          status: ContextItemStatus;
          source: string | null;
          confidence: number | null;
          supersedes_id: string | null;
          rejection_reason: string | null;
          metadata: Json | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          startup_id: string;
          type: ContextItemType;
          content: string;
          status?: ContextItemStatus;
          source?: string | null;
          confidence?: number | null;
          supersedes_id?: string | null;
          rejection_reason?: string | null;
          metadata?: Json | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          startup_id?: string;
          type?: ContextItemType;
          content?: string;
          status?: ContextItemStatus;
          source?: string | null;
          confidence?: number | null;
          supersedes_id?: string | null;
          rejection_reason?: string | null;
          metadata?: Json | null;
        };
      };

      brand_decisions: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          startup_id: string;
          category: BrandDecisionCategory;
          title: string;
          content: string;
          rationale: string | null;
          status: BrandDecisionStatus;
          supersedes_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          startup_id: string;
          category: BrandDecisionCategory;
          title: string;
          content: string;
          rationale?: string | null;
          status?: BrandDecisionStatus;
          supersedes_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          startup_id?: string;
          category?: BrandDecisionCategory;
          title?: string;
          content?: string;
          rationale?: string | null;
          status?: BrandDecisionStatus;
          supersedes_id?: string | null;
        };
      };

      context_relationships: {
        Row: {
          id: string;
          created_at: string;
          startup_id: string;
          from_context_id: string;
          to_context_id: string;
          relationship_type: ContextRelationshipType;
        };
        Insert: {
          id?: string;
          created_at?: string;
          startup_id: string;
          from_context_id: string;
          to_context_id: string;
          relationship_type: ContextRelationshipType;
        };
        Update: {
          id?: string;
          created_at?: string;
          startup_id?: string;
          from_context_id?: string;
          to_context_id?: string;
          relationship_type?: ContextRelationshipType;
        };
      };

      decision_context_links: {
        Row: {
          decision_id: string;
          context_item_id: string;
          relationship_type: DecisionContextLinkType;
          created_at: string;
        };
        Insert: {
          decision_id: string;
          context_item_id: string;
          relationship_type: DecisionContextLinkType;
          created_at?: string;
        };
        Update: {
          decision_id?: string;
          context_item_id?: string;
          relationship_type?: DecisionContextLinkType;
          created_at?: string;
        };
      };

      decision_relationships: {
        Row: {
          id: string;
          created_at: string;
          startup_id: string;
          from_decision_id: string;
          to_decision_id: string;
          relationship_type: DecisionRelationshipType;
        };
        Insert: {
          id?: string;
          created_at?: string;
          startup_id: string;
          from_decision_id: string;
          to_decision_id: string;
          relationship_type: DecisionRelationshipType;
        };
        Update: {
          id?: string;
          created_at?: string;
          startup_id?: string;
          from_decision_id?: string;
          to_decision_id?: string;
          relationship_type?: DecisionRelationshipType;
        };
      };

      change_analyses: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          startup_id: string;
          source_context_item_id: string;
          summary: string;
          status: ChangeAnalysisStatus;
          analysis: Json | null;
          reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          startup_id: string;
          source_context_item_id: string;
          summary: string;
          status?: ChangeAnalysisStatus;
          analysis?: Json | null;
          reviewed_at?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          startup_id?: string;
          source_context_item_id?: string;
          summary?: string;
          status?: ChangeAnalysisStatus;
          analysis?: Json | null;
          reviewed_at?: string | null;
        };
      };

      change_analysis_impacts: {
        Row: {
          id: string;
          created_at: string;
          change_analysis_id: string;
          brand_decision_id: string;
          impact_type: string;
          severity: ImpactSeverity;
          reason: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          change_analysis_id: string;
          brand_decision_id: string;
          impact_type: string;
          severity: ImpactSeverity;
          reason: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          change_analysis_id?: string;
          brand_decision_id?: string;
          impact_type?: string;
          severity?: ImpactSeverity;
          reason?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Startup = Tables<"startups">;
export type ContextItem = Tables<"context_items">;
export type BrandDecision = Tables<"brand_decisions">;
export type ChangeAnalysis = Tables<"change_analyses">;
export type ChangeAnalysisImpact = Tables<"change_analysis_impacts">;

