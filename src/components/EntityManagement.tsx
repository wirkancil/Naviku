import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, Trash2, Edit3, Loader2 } from 'lucide-react';
import { useEntities } from '@/hooks/useEntities';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

export const EntityManagement = () => {
  const { entities, loading, createEntity, updateEntity, deleteEntity } = useEntities();
  const { toast } = useToast();
  const [newEntityName, setNewEntityName] = useState('');
  const [newEntityCode, setNewEntityCode] = useState('');
  const [editingEntity, setEditingEntity] = useState<{ id: string; name: string; code: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingEntityId, setDeletingEntityId] = useState<string | null>(null);

  const handleCreateEntity = async () => {
    if (!newEntityName.trim()) return;

    setIsSubmitting(true);
    const { error } = await createEntity(newEntityName.trim(), newEntityCode.trim() || undefined);
    
    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Entity created successfully",
      });
      setNewEntityName('');
      setNewEntityCode('');
      
      // Trigger refresh event for Admin page to reload entities
      try {
        window.dispatchEvent(new CustomEvent('org-units-changed'));
        console.log('✅ Entity created, refresh event dispatched');
      } catch (e) {
        console.error('Failed to dispatch refresh event:', e);
      }
    }
    setIsSubmitting(false);
  };

  const handleUpdateEntity = async () => {
    if (!editingEntity) return;

    setIsSubmitting(true);
    const { error } = await updateEntity(editingEntity.id, {
      name: editingEntity.name,
      code: editingEntity.code || undefined
    });
    
    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Entity updated successfully",
      });
      setEditingEntity(null);
      
      // Trigger refresh event
      try {
        window.dispatchEvent(new CustomEvent('org-units-changed'));
      } catch (e) {
        console.error('Failed to dispatch refresh event:', e);
      }
    }
    setIsSubmitting(false);
  };

  const handleDeleteEntity = async (id: string) => {
    setDeletingEntityId(id);
    const { error } = await deleteEntity(id);
    
    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Entity deleted successfully",
      });
      
      // Trigger refresh event
      try {
        window.dispatchEvent(new CustomEvent('org-units-changed'));
      } catch (e) {
        console.error('Failed to dispatch refresh event:', e);
      }
    }
    setDeletingEntityId(null);
  };

  const toggleEntityStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await updateEntity(id, { is_active: !currentStatus });
    
    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: `Entity ${!currentStatus ? 'activated' : 'deactivated'} successfully`,
      });
      
      // Trigger refresh event
      try {
        window.dispatchEvent(new CustomEvent('org-units-changed'));
      } catch (e) {
        console.error('Failed to dispatch refresh event:', e);
      }
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entity Management</CardTitle>
        <CardDescription>
          Manage organizational entities. Entities represent different business units or companies.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Create New Entity */}
          <div className="border rounded-lg p-4">
            <h3 className="text-lg font-medium mb-4">Add New Entity</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="entity-name">Entity Name *</Label>
                <Input
                  id="entity-name"
                  value={newEntityName}
                  onChange={(e) => setNewEntityName(e.target.value)}
                  placeholder="e.g., Acme Corp"
                />
              </div>
              <div>
                <Label htmlFor="entity-code">Entity Code</Label>
                <Input
                  id="entity-code"
                  value={newEntityCode}
                  onChange={(e) => setNewEntityCode(e.target.value)}
                  placeholder="e.g., ACME"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleCreateEntity}
                  disabled={!newEntityName.trim() || isSubmitting}
                  className="w-full"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Add Entity
                </Button>
              </div>
            </div>
          </div>

          {/* Entities List */}
          <div>
            <h3 className="text-lg font-medium mb-4">Existing Entities</h3>
            {entities.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No entities found. Create your first entity above.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entities.map((entity) => (
                    <TableRow key={entity.id}>
                      <TableCell>
                        {editingEntity?.id === entity.id ? (
                          <Input
                            value={editingEntity.name}
                            onChange={(e) => setEditingEntity({ ...editingEntity, name: e.target.value })}
                            className="max-w-xs"
                          />
                        ) : (
                          entity.name
                        )}
                      </TableCell>
                      <TableCell>
                        {editingEntity?.id === entity.id ? (
                          <Input
                            value={editingEntity.code}
                            onChange={(e) => setEditingEntity({ ...editingEntity, code: e.target.value })}
                            className="max-w-xs"
                          />
                        ) : (
                          entity.code || '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={entity.is_active ? "default" : "secondary"}
                          className="cursor-pointer"
                          onClick={() => toggleEntityStatus(entity.id, entity.is_active)}
                        >
                          {entity.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(entity.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editingEntity?.id === entity.id ? (
                            <>
                              <Button
                                size="sm"
                                onClick={handleUpdateEntity}
                                disabled={isSubmitting}
                              >
                                {isSubmitting ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  'Save'
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingEntity(null)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingEntity({
                                  id: entity.id,
                                  name: entity.name,
                                  code: entity.code || ''
                                })}
                              >
                                <Edit3 className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                  >
                                    {deletingEntityId === entity.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Entity</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "{entity.name}"? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteEntity(entity.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};