require 'xcodeproj'

native_dir = File.expand_path('..', __dir__)
project_path = File.join(native_dir, 'ios', 'App', 'App.xcodeproj')
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |item| item.name == 'App' }
abort('App target not found') unless target

app_group = project.main_group.groups.find { |group| group.display_name == 'App' } || project.main_group
sounds = ['adhan_default_short.wav', 'adhan_fajr_short.wav']

sounds.each do |name|
  existing = app_group.files.find { |file| File.basename(file.path.to_s) == name }
  reference = existing || app_group.new_file(name)
  unless target.resources_build_phase.files_references.include?(reference)
    target.resources_build_phase.add_file_reference(reference, true)
  end
end

project.save
puts 'Added Miqati notification sounds to iOS Copy Bundle Resources.'
