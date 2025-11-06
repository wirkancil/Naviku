import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Save, X, RefreshCw, Trash2, Users } from 'lucide-react';
import { useDivisions } from '@/hooks/useDivisions';
import { useEntities } from '@/hooks/useEntities';
import { toast } from 'sonner';

// Sekarang ini adalah TEAM MANAGEMENT (divisions = teams)
export const DivisionDepartmentManagement = () => {
  // Teams (divisions)
  const { divisions: teams, loading: teamsLoading, createDivision: createTeam, updateDivision: updateTeam, deleteDivision: deleteTeam, refetch: refetchTeams } = useDivisions();
  const { entities, loading: entitiesLoading } = useEntities();
  
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamEntityId, setNewTeamEntityId] = useState<string>('');
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState('');
  const [editingTeamEntityId, setEditingTeamEntityId] = useState<string>('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [updatingTeam, setUpdatingTeam] = useState<string | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<string | null>(null);
  const [filterEntityId, setFilterEntityId] = useState<string>('all');

  const syncOrgUnits = () => {
    try {
      window.dispatchEvent(new CustomEvent('org-units-changed'));
    } catch (e) {
      // no-op for environments without window
    }
  };

  // Filter teams by entity
  const filteredTeams = filterEntityId === 'all' 
    ? teams 
    : teams.filter((t) => t.entity_id === filterEntityId);

  // Team handlers
  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      toast.error('Team name is required');
      return;
    }
    setCreatingTeam(true);
    try {
      const entityId = newTeamEntityId && newTeamEntityId !== 'none' ? newTeamEntityId : null;
      await createTeam(newTeamName.trim(), entityId);
      setNewTeamName('');
      setNewTeamEntityId('');
      toast.success('Team created successfully');
      syncOrgUnits();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create team');
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleEditTeam = (team: any) => {
    setEditingTeamId(team.id);
    setEditingTeamName(team.name);
    setEditingTeamEntityId(team.entity_id || '');
  };

  const handleSaveTeam = async (id: string) => {
    if (!editingTeamName.trim()) {
      toast.error('Team name is required');
      return;
    }
    setUpdatingTeam(id);
    try {
      const entityId = editingTeamEntityId && editingTeamEntityId !== 'none' ? editingTeamEntityId : null;
      await updateTeam(id, { name: editingTeamName.trim(), entity_id: entityId });
      setEditingTeamId(null);
      setEditingTeamName('');
      setEditingTeamEntityId('');
      toast.success('Team updated successfully');
      syncOrgUnits();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update team');
    } finally {
      setUpdatingTeam(null);
    }
  };

  const handleCancelTeam = () => {
    setEditingTeamId(null);
    setEditingTeamName('');
    setEditingTeamEntityId('');
  };

  const handleDeleteTeam = async (id: string, name: string) => {
    if (!confirm(`Delete team "${name}"? This cannot be undone.`)) return;
    setDeletingTeam(id);
    try {
      await deleteTeam(id);
      toast.success('Team deleted successfully');
      syncOrgUnits();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete team');
    } finally {
      setDeletingTeam(null);
    }
  };

  const handleRefreshAll = async () => {
    await refetchTeams();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Team Management</CardTitle>
            <CardDescription>
              Manage teams within entities. Each team can be assigned to an entity and have a head (leader).
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={teamsLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${teamsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create Team */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <Users className="h-3 w-3" /> Teams
            </Badge>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input
              placeholder="Enter team name..."
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
            />
            <Select value={newTeamEntityId} onValueChange={setNewTeamEntityId}>
              <SelectTrigger>
                <SelectValue placeholder="Select entity (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Entity</SelectItem>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleCreateTeam} disabled={creatingTeam}>
              {creatingTeam ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Filter by Entity */}
          <div className="flex items-center gap-2">
            <Select value={filterEntityId} onValueChange={setFilterEntityId}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Filter by entity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setFilterEntityId('all')}>Reset</Button>
          </div>

          {/* Teams Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team Name</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTeams.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No teams found.</TableCell>
                </TableRow>
              ) : (
                filteredTeams.map((team) => (
                  <TableRow key={team.id}>
                    <TableCell>
                      {editingTeamId === team.id ? (
                        <Input
                          value={editingTeamName}
                          onChange={(e) => setEditingTeamName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveTeam(team.id)}
                        />
                      ) : (
                        <span className="font-medium">{team.name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingTeamId === team.id ? (
                        <Select value={editingTeamEntityId} onValueChange={setEditingTeamEntityId}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select entity" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Entity</SelectItem>
                            {entities.map((e) => (
                              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-muted-foreground">{entities.find(e => e.id === team.entity_id)?.name || '—'}</span>
                      )}
                    </TableCell>
                    <TableCell>{new Date(team.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {editingTeamId === team.id ? (
                          <>
                            <Button size="sm" onClick={() => handleSaveTeam(team.id)} disabled={updatingTeam === team.id}>
                              {updatingTeam === team.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleCancelTeam} disabled={updatingTeam === team.id}>
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handleEditTeam(team)} disabled={updatingTeam === team.id || deletingTeam === team.id}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleDeleteTeam(team.id, team.name)} disabled={updatingTeam === team.id || deletingTeam === team.id} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                              {deletingTeam === team.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};